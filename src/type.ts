type Action = {
  id: string,
  type: string,
  shadow: boolean,
  parents: string[],
};
type ActionScope = {
  keys: (string | number)[],
  modifyType: number | null,
};
type UndoValue = any;

type MachineConfig = {
  getActionScopes: (action: Action) => ActionScope[],
  merge: (offending: ActionScope, local: Action[], remote: Action) =>
    Promise<{ local: Action[], remote: Action[] }>,
  run: (action: Action) => Promise<UndoValue>,
  undo: (action: Action, undoValue: UndoValue) => Promise<void>,
  storeAction: (action: Action, undoValue: UndoValue) => Promise<void>,
  getCurrentAction: () => Promise<Action>,
  getAction: (id: string) => Promise<Action>,
  setCurrentAction: (id: string) => Promise<void>,
};

type SyncAPISet = {
  fetchMore: (lastId?: string) => Promise<void>,
  submit: (ourActions: Action[], theirActions: Action[]) => Promise<void>,
};

interface Machine {
  run(action: Action): Promise<void>;
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
  sync(api: SyncAPISet): Promise<void>;
}
