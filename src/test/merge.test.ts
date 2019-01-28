import { Action, ActionScope, MachineConfig } from '../type';
import merge from '../merge';

type ActionData = {
  key: string[][],
  op: '+' | '-' | '=',
  value: number,
};

type UndoData = {
  values: number[],
};

function getScopes(action: Action<ActionData, UndoData>): ActionScope[] {
  if (action.type === 'normal') {
    return action.data.key.map(v => ({
      keys: v,
      modifyType: action.data.op === '=' ? null : 0,
    }));
  }
  return [];
}

const machineConfig: MachineConfig<ActionData, UndoData> = {
  getScopes,
  getReverse: () => null,
  merge: () => null,
  run: () => null,
};

function newAction(
  key: string[][], op: '+' | '-' | '=', value: number,
): Action<ActionData, UndoData> {
  return {
    id: '',
    type: 'normal',
    data: { key, op, value },
    undoData: { values: key.map(() => 0) },
    parent: '',
  };
}
describe('merge', () => {
  it('should return results', async () => {
    expect(await merge([
      newAction([['a', 'x']], '+', 3),
      newAction([['a', 'y']], '=', 2),
    ], [
      newAction([['a', 'x']], '-', 2),
    ], machineConfig)).toEqual({
      left: [
        newAction([['a', 'x']], '-', 2),
      ],
      right: [
        newAction([['a', 'x']], '+', 3),
        newAction([['a', 'y']], '=', 2),
      ],
    });
  });
});
