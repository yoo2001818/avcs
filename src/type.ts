export type BaseAction = {
  id: string,
  shadow: boolean,
};

export type NormalAction<T, U> = BaseAction & {
  type: 'normal',
  data: T,
  undoData: U,
  parent: string,
};

export type MergeAction<T> = BaseAction & {
  type: 'merge',
  parents: { id: string, data: T[] }[],
};

export type Action<T, U> = NormalAction<T, U> | MergeAction<T>;

export type ActionScope = {
  keys: (string | number)[],
  modifyType: number | null,
};

export type MachineConfig<T, U> = {
  getScopes: (action: Action<T, U>) => ActionScope[],
  getReverse: (data: T, undoData: U) => T,
  merge: (
    offending: ActionScope,
    local: Action<T, U>[],
    remote: Action<T, U>[],
  ) => Promise<{ local: Action<T, U>[], remote: Action<T, U>[] }>,
  run: (payload: T) => Promise<U>,
};

export type SyncRPCSet<T, U> = {
  fetch: (lastId?: string) => Promise<Action<T, U>[]>,
  submit: (ourActions: Action<T, U>[], theirActions: Action<T, U>[]) =>
    Promise<void>,
};
