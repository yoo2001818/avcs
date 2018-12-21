export type Action<T> = {
  id: string,
  type: 'action' | 'undo' | 'merge' | 'shadow',
  parents: string[],
  payload: T,
};
export type ActionScope = {
  keys: (string | number)[],
  modifyType: number | null,
};
export type UndoValue = any;

export type MachineConfig<T> = {
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

export type SyncRPCSet<T> = {
  fetchMore: (lastId?: string) => Promise<void>,
  submit: (ourActions: Action<T>[], theirActions: Action<T>[]) => Promise<void>,
};
