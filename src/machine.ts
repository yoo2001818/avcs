import randomstring from 'randomstring';
import { Action, MachineConfig, SyncRPCSet } from './type';

export default class Machine<T> {
  config: MachineConfig<T>;
  constructor(config: MachineConfig<T>) {
    this.config = config;
  }
  generateId(): string {
    return randomstring.generate();
  }
  async run(payload: T): Promise<void> {
    // Run and record the action into the system.
    const currentAction = await this.config.getCurrentAction();
    const newAction: Action<T> = {
      payload,
      id: this.generateId(),
      type: 'action',
      parents: [currentAction.id],
    };
    const undoResult = await this.config.run(payload);
    await this.config.storeAction(newAction, undoResult);
    await this.config.setCurrentAction(newAction.id);
  }
  async sync(rpc: SyncRPCSet<T>): Promise<void> {
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
  }
}
