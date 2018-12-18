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

interface Machine {
  run(action: Action): Promise<void>;
  // TODO Revise sync protocol
  sync(): void;
}
