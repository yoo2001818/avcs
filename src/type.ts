export type Action<T, U> = {
  id: string,
  type: 'action' | 'undo' | 'merge' | 'shadow',
  parents: string[],
  payload: T,
  undoValue: U,
};
export type ActionScope = {
  keys: (string | number)[],
  modifyType: number | null,
};

export type MachineConfig<T, U> = {
  getActionScopes: (action: Action<T, U>) => ActionScope[],
  merge: (
    offending: ActionScope,
    local: Action<T, U>[],
    remote: Action<T, U>[],
  ) => Promise<{ local: Action<T, U>[], remote: Action<T, U>[] }>,
  //
  run: (payload: T) => Promise<U>,
  undo: (payload: T, undoValue: U) => Promise<void>,
  //
  storeAction: (action: Action<T, U>) => Promise<void>,
  getCurrentAction: () => Promise<Action<T, U>>,
  getAction: (id: string) => Promise<Action<T, U>>,
  setCurrentAction: (id: string) => Promise<void>,
};

export type SyncRPCSet<T, U> = {
  fetchMore: (lastId?: string) => Promise<Action<T, U>[]>,
  submit: (ourActions: Action<T, U>[], theirActions: Action<T, U>[]) =>
    Promise<void>,
};
