type Action<T> = {
  id: string,
  type: 'action' | 'undo' | 'merge' | 'shadow',
  parents: string[],
  payload: T,
};
type ActionScope = {
  keys: (string | number)[],
  modifyType: number | null,
};
type UndoValue = any;

type MachineConfig<T> = {
  getActionScopes: (action: Action<T>) => ActionScope[],
  merge: (offending: ActionScope, local: Action<T>[], remote: Action<T>) =>
    Promise<{ local: Action<T>[], remote: Action<T>[] }>,
  run: (action: Action<T>) => Promise<UndoValue>,
  undo: (action: Action<T>, undoValue: UndoValue) => Promise<void>,
  storeAction: (action: Action<T>, undoValue: UndoValue) => Promise<void>,
  getCurrentAction: () => Promise<Action<T>>,
  getAction: (id: string) => Promise<Action<T>>,
  setCurrentAction: (id: string) => Promise<void>,
};

type SyncRPCSet<T> = {
  fetchMore: (lastId?: string) => Promise<void>,
  submit: (ourActions: Action<T>[], theirActions: Action<T>[]) => Promise<void>,
};

interface Machine<T> {
  run(action: Action<T>): Promise<void>;
  // Sync protocol is the following:
  // 0. If we know the common parent, we can rewind and put into stack until
  //    it is met.
  // 1. Connect to the remote server, and fetch its latest actions (in bulk).
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
  // The problem is, to fetch common parent, we have to continously fetch from
  // the remote point.
  // To handle this, we make sync function to accept networking function set.
  sync(rpc: SyncRPCSet<T>): Promise<void>;
}
