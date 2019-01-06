import { Action } from '../type';

export interface Storage<T, U> {
  set: (id: string, action: Action<T, U>) => Promise<void>;
  getCurrent: () => Promise<Action<T, U>>;
  get: (id: string) => Promise<Action<T, U>>;
  setCurrent: (id: string) => Promise<void>;
}
