import { Storage } from './index';
import { Action } from '../type';

export default class MemoryStorage<T, U> implements Storage<T, U> {
  map: { [key: string]: Action<T, U> } = {};
  currentId: string = null;
  async set(id: string, action: Action<T, U>) {
    this.map[id] = action;
  }
  async get(id: string) {
    return this.map[id];
  }
  async setCurrent(id: string) {
    this.currentId = id;
  }
  async getCurrent() {
    return this.map[this.currentId];
  }
}
