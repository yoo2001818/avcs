import Machine from './machine';
import MemoryStorage from './storage/memory';
import { Action } from './type';

type ActionData = {
  type: 'set' | 'delete' | 'increment' | 'decrement',
  key: string[],
  value?: any,
};

type ActionUndoData = {};

type JSONAction = Action<ActionData, ActionUndoData>;

const machine = new Machine({
  getScopes: (action: JSONAction) => {
  },
}, new MemoryStorage());
