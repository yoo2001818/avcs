import randomstring from 'randomstring';
import { Action, MachineConfig, SyncRPCSet } from './type';
import { separateBulk } from './util/iterator';

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
  async undoLast(): Promise<void> {
    const action = await this.config.getCurrentAction();
    // TODO Transactions
    await this.forceUndo(action);
    await this.config.setCurrentAction(action.parents[0]);
  }
  async forceUndo(action: Action<T, U>): Promise<void> {
    switch (action.type) {
      case 'action':
        return this.config.undo(action.payload, action.undoValue);
      case 'undo':
        await this.config.run(action.payload);
        return;
      case 'merge':
        return;
    }
  }
  async forceRedo(action: Action<T, U>): Promise<void> {
    switch (action.type) {
      case 'action':
        await this.config.run(action.payload);
        return;
      case 'undo':
        return this.config.undo(action.payload, action.undoValue);
      case 'merge':
        return;
    }
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
    let leftEnded: boolean = false;
    let rightEnded: boolean = false;
    const seenTable: { [key: string]: number } = {};
    while (!leftEnded || !rightEnded) {
      const currentLeft = leftEnded ? null : (await left.next()).value;
      const currentRight = rightEnded ? null : (await right.next()).value;
      if (currentLeft == null) leftEnded = true;
      if (currentRight == null) rightEnded = true;
      if (!leftEnded && seenTable[currentLeft.id]) {
        leftStack.push(currentLeft);
        rightStack = rightStack.slice(0, seenTable[currentLeft.id]);
        break;
      } else if (!rightEnded && seenTable[currentRight.id]) {
        rightStack.push(currentRight);
        leftStack = leftStack.slice(0, seenTable[currentRight.id]);
        break;
      } else if (!leftEnded && !rightEnded) {
        leftStack.push(currentLeft);
        rightStack.push(currentRight);
        if (currentLeft.id === currentRight.id) break;
        seenTable[currentLeft.id] = leftStack.length;
        seenTable[currentRight.id] = rightStack.length;
      } else {
        if (currentLeft != null) leftStack.push(currentLeft);
        if (currentRight != null) rightStack.push(currentRight);
      }
    }
    return {
      left: leftStack,
      right: rightStack,
    };
  }
  async jumpTo(targetId: string): Promise<void> {
    // Get diverging path for the action, then undo on left / proceed on right.
    const { left, right } = await this.getDivergingPath(
      this.getHistory(), this.getHistory(targetId));
    for (let i = 0; i < left.length; i += 1) {
      await this.forceUndo(left[i]);
    }
    for (let i = right.length - 1; i >= 0; i -= 1) {
      await this.forceRedo(right[i]);
    }
  }
  async sync(rpc: SyncRPCSet<T, U>): Promise<void> {
    // Sync protocol is the following:
    // 0. If we know the common parent, we can rewind and put into stack until
    //    it is met.
    // 1. Connect to the remote server, and fetchs latest actions (in bulk).
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
    let nextId: string = null;
    const { left, right } = await this.getDivergingPath(
      this.getHistory(),
      separateBulk(async () => {
        const output = await rpc.fetch(nextId);
        if (output.length > 0) {
          nextId = output[output.length - 1].id;
        }
        return output;
      }),
    );
  }
}
