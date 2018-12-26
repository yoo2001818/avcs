import randomstring from 'randomstring';
import { Action, MachineConfig, SyncRPCSet } from './type';

export default class Machine<T, U> {
  config: MachineConfig<T, U>;
  constructor(config: MachineConfig<T, U>) {
    this.config = config;
  }
  generateId(): string {
    return randomstring.generate();
  }
  async run(payload: T): Promise<string> {
    // Run and record the action into the system.
    const currentAction = await this.config.getCurrentAction();
    const undoValue = await this.config.run(payload);
    const newAction: Action<T, U> = {
      payload,
      undoValue,
      id: this.generateId(),
      type: 'action',
      parents: [currentAction.id],
    };
    await this.config.storeAction(newAction);
    await this.config.setCurrentAction(newAction.id);
    return newAction.id;
  }
  async undoLast(): Promise<string> {
    const action = await this.config.getCurrentAction();
    await this.config.undo(action.payload, action.undoValue);
    // TODO Check if we've been synchronized since then - remove the action
    // if the action hasn't shared with any other nodes
    const newAction: Action<T, U> = {
      payload: action.payload,
      undoValue: action.undoValue,
      id: this.generateId(),
      type: 'action',
      parents: [action.id],
    };
    await this.config.storeAction(newAction);
    await this.config.setCurrentAction(newAction.id);
    return newAction.id;
  }
  async * getHistory(startId?: string): AsyncIterator<Action<T, U>> {
    let action: Action<T, U>;
    if (startId != null) {
      action = await this.config.getAction(startId);
    } else {
      action = await this.config.getCurrentAction();
    }
    while (action != null) {
      yield action;
      const parentId = action.parents[0];
      if (parentId == null) {
        break;
      } else {
        action = await this.config.getAction(parentId);
      }
    }
  }
  async getDivergingPath(
    left: AsyncIterator<Action<T, U>>, right: AsyncIterator<Action<T, U>>,
  ): Promise<{ left: Action<T, U>[], right: Action<T, U>[] }> {
    let leftStack: Action<T, U>[] = [];
    let rightStack: Action<T, U>[] = [];
    let seenTable: { [key: string]: number } = {};
    while (true) {
      let currentLeft = (await left.next()).value;
      let currentRight = (await right.next()).value;
      if (currentLeft == null || currentRight == null) break;
      if (seenTable[currentLeft.id]) {
        leftStack.push(currentLeft);
        rightStack = rightStack.slice(0, seenTable[currentLeft.id]);
      } else if (seenTable[currentRight.id]) {
        rightStack.push(currentRight);
      } else {
        leftStack.push(currentLeft);
        rightStack.push(currentRight);
      }
    }
  }
  async sync(rpc: SyncRPCSet<T, U>): Promise<void> {
    // Sync protocol is the following:
    // 0. If we know the common parent, we can rewind and put into stack until
    //    it is met.
    // 1. Connect to the remote server, and fetchits latest actions (in bulk).
    //    Then, put them into separate stack.
    // 2. Rewind from this side as well, but the count may vary.
    // 3. If we've seen remote's action from local side, it's finally met -
    //    Perform the merge.
    // 4. After merging, we get the results - we have to push them into the remote
    //    server.
    //    Merging algorithm is supposed to give two sets of actions. One is for
    //    local, and one is for server.
    //    We submit both actions to the server, but instruct them to run which
    //    set to run.
    // 5. Run the actions from the local side.
    //
    // The problem is, to fetch common parent, wehave to continously fetch from
    // the remote point.
    // To handle this, we make sync function to accept networking function set.
    let localStack: Action<T, U>[] = [];
    let remoteStack: Action<T, U>[] = [];
    let seenTable: { [key: string]: boolean } = {};
    let remoteLastId: string = null;
    (await rpc.fetchMore(remoteLastId)).forEach(v => remoteStack.push(v));
  }
}
