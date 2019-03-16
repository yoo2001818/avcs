export type BaseAction = {
  id: string,
  depth: number,
};

export type InitAction<T, U> = BaseAction & {
  type: 'init',
  data?: T,
  undoData?: U,
};

export type NormalAction<T, U> = BaseAction & {
  type: 'normal',
  data: T,
  undoData: U,
  parent: string,
  undoId?: string,
};

export type MergeAction<T, U> = BaseAction & {
  type: 'merge',
  data?: T,
  parents: { id: string, data: T[], undoData: U[] }[],
};

export type Action<T, U> =
  InitAction<T, U> | NormalAction<T, U> | MergeAction<T, U>;

export type ActionScope = {
  keys: (string | number)[],
  modifyType: number | null,
};

export type MachineConfig<T, U, V> = {
  getScopes: (data: T) => ActionScope[],
  getReverse: (data: T, undoData: U) => T,
  merge: (
    offending: (string | number)[][],
    left: Action<T, U>[],
    right: Action<T, U>[],
    config?: V,
  ) => Promise<{ left: Action<T, U>[], right: Action<T, U>[] }>,
  run: (payload: T, config?: V) => Promise<U>,
};

export type SyncRPCSet<T, U> = {
  fetch: (lastId?: string) => Promise<Action<T, U>[]>,
  run: (datas: T[]) => Promise<U[]>,
  submit: (action: Action<T, U>) => Promise<void>,
};
