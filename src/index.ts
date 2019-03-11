import Machine from './machine';
import MemoryStorage from './storage/memory';
import { Action, ActionScope } from './type';
import { getGraph } from './util/graph';
import printLog from './util/printLog';

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
  const initAction = await machine.init();
  await machine.run({ type: 'set', keys: ['user', 'name'], value: 'test' });
  await machine.run({ type: 'set', keys: ['user', 'id'], value: 0 });
  const lastAction = await machine.run({ type: 'increment', keys: ['user', 'id'] });
  console.log(dataStore);
  await machine.checkout(initAction.id);
  console.log('checked out:', await machine.getCurrent());
  const lastAction2 = await machine.run({ type: 'set', keys: ['user', 'abc'], value: 0 });
  console.log(dataStore);
  await machine.checkout(lastAction.id);
  console.log('checked out:', await machine.getCurrent());
  console.log(dataStore);
  console.log('----');
  const mergeAction = await machine.merge(lastAction2.id);
  console.log(dataStore);
  await machine.checkout(initAction.id);
  console.log(dataStore);
  await machine.checkout(mergeAction.id);
  console.log(dataStore);
  const mergeAction2 = await machine.merge(lastAction.id);
  const mergeAction3 = await machine.merge(initAction.id);
  for await (const action of machine.getHistory()) {
    console.log(action);
  }
  console.log('-------');
  const linePrinter = printLog(
    (action: Action<ActionData, ActionUndoData>) => {
      switch (action.type) {
        case 'init':
          return action.id.slice(0, 7) + ' Init';
        case 'merge':
          return action.id.slice(0, 7) + ' Merge';
        case 'normal':
          return action.id.slice(0, 7) + ' ' +
            action.data.type + ':  ' +
            action.data.keys.join('.');
      }
    },
    getGraph(machine.getHistory.bind(machine)));
  for await (const line of linePrinter) {
    console.log(line);
  }
}

main();
