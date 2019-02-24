import Machine from './machine';
import MemoryStorage from './storage/memory';
import { Action, ActionScope } from './type';

type ActionData = {
  type: 'set' | 'delete' | 'increment' | 'decrement',
  keys: string[],
  value?: any,
};

type ActionUndoData = { prevValue?: any };

type JSONAction = Action<ActionData, ActionUndoData>;

const dataStore: any = {};

function findNode(keys: string[], root: any) {
  return keys.reduce((prev, key, i) => {
    if (i === keys.length - 1) return prev;
    if (prev[key] == null) {
      prev[key] = {};
    }
    return prev[key];
  }, root);
}

const machine = new Machine({
  getScopes: (data: ActionData): ActionScope[] => {
    return [{
      keys: data.keys,
      modifyType: data.type === 'increment' || data.type === 'decrement' ?
        0 :
        null,
    }];
  },
  getReverse: (data: ActionData, undoData: ActionUndoData): ActionData => {
    switch (data.type) {
      case 'set':
      case 'delete':
        return { type: 'set', keys: data.keys, value: undoData.prevValue };
      case 'increment':
        return { type: 'decrement', keys: data.keys };
      case 'decrement':
        return { type: 'increment', keys: data.keys };
    }
  },
  merge: async (
    offending: (string | number)[][],
    left: JSONAction[],
    right: JSONAction[],
  ) => {
    throw new Error(offending.map(v => v.join(', ')).join('_'));
  },
  run: async (data: ActionData): Promise<ActionUndoData> => {
    const key = data.keys[data.keys.length - 1];
    const node = findNode(data.keys, dataStore);
    switch (data.type) {
      case 'set': {
        const prevValue = node[key];
        node[key] = data.value;
        return { prevValue };
      }
      case 'delete': {
        const prevValue = node[key];
        delete node[key];
        return { prevValue };
      }
      case 'increment': {
        node[key] += 1;
        return {};
      }
      case 'decrement': {
        node[key] -= 1;
        return {};
      }
    }
  },
}, new MemoryStorage());

async function main() {
  console.log(await machine.init());
  console.log(await machine.run({ type: 'set', keys: ['user', 'name'], value: 'test' }));
  console.log(await machine.run({ type: 'set', keys: ['user', 'id'], value: 0 }));
  console.log(await machine.run({ type: 'increment', keys: ['user', 'id'] }));
  console.log(dataStore);
  console.log('----');
  for await (const action of machine.getHistory()) {
    console.log(action);
  }
}

main();
