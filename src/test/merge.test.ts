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
  merge: async (offending, left, right) => {
    return { left, right: left };
  },
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
  it('should return results if not conflicted', async () => {
    expect(await merge([
      newAction([['a', 'x']], '+', 3),
      newAction([['a', 'y']], '=', 2),
    ], [
      newAction([['a', 'x']], '-', 2),
      newAction([['a', 'z']], '=', 2),
    ], machineConfig)).toEqual({
      left: [
        newAction([['a', 'x']], '-', 2),
        newAction([['a', 'z']], '=', 2),
      ],
      right: [
        newAction([['a', 'x']], '+', 3),
        newAction([['a', 'y']], '=', 2),
      ],
    });
  });
  it('should run merge handler if conflicted', async () => {
    const mergeHandler = jest.fn();
    mergeHandler.mockReturnValue(Promise.resolve({
      left: [
        newAction([['a', 'z']], '=', 3),
      ],
      right: [],
    }));
    expect(await merge([
      newAction([['a', 'x']], '+', 3),
      newAction([['a', 'z']], '=', 2),
    ], [
      newAction([['a', 'x']], '-', 2),
      newAction([['a', 'z']], '=', 3),
    ], { ...machineConfig, merge: mergeHandler })).toEqual({
      left: [
        newAction([['a', 'x']], '-', 2),
        newAction([['a', 'z']], '=', 3),
      ],
      right: [
        newAction([['a', 'x']], '+', 3),
      ],
    });
    expect(mergeHandler).toHaveBeenCalledWith([['a', 'z']], [
      newAction([['a', 'z']], '=', 2),
    ], [
      newAction([['a', 'z']], '=', 3),
    ]);
  });
  it('should ascend into parent scope', async () => {
    const mergeHandler = jest.fn();
    mergeHandler.mockReturnValue(Promise.resolve({
      left: [],
      right: [
        newAction([['a', 'a']], '=', 3),
        newAction([['a']], '=', 3),
      ],
    }));
    expect(await merge([
      newAction([['a', 'a']], '=', 3),
      newAction([['a']], '=', 3),
    ], [
      newAction([['a', 'b']], '=', 3),
      newAction([['b']], '=', 3),
    ], { ...machineConfig, merge: mergeHandler })).toEqual({
      left: [
        newAction([['b']], '=', 3),
      ],
      right: [
        newAction([['a', 'a']], '=', 3),
        newAction([['a']], '=', 3),
      ],
    });
    expect(mergeHandler).toHaveBeenCalledWith([['a']], [
      newAction([['a', 'a']], '=', 3),
      newAction([['a']], '=', 3),
    ], [
      newAction([['a', 'b']], '=', 3),
    ]);
  });
  it('should combine scopes if multiple scope actions exist', async () => {
    const mergeHandler = jest.fn();
    mergeHandler.mockReturnValue(Promise.resolve({
      left: [
        newAction([['b', 'b']], '=', 6),
      ],
      right: [
        newAction([['a', 'b']], '=', 4),
      ],
    }));
    expect(await merge([
      newAction([['a', 'a']], '=', 3),
      newAction([['a', 'b'], ['b', 'b']], '=', 4),
    ], [
      newAction([['b', 'a']], '=', 5),
      newAction([['b', 'b']], '=', 6),
    ], { ...machineConfig, merge: mergeHandler })).toEqual({
      left: [
        newAction([['b', 'b']], '=', 6),
        newAction([['b', 'a']], '=', 5),
      ],
      right: [
        newAction([['a', 'a']], '=', 3),
        newAction([['a', 'b']], '=', 4),
      ],
    });
    expect(mergeHandler).toHaveBeenCalledWith([['b', 'b'], ['a', 'b']], [
      newAction([['a', 'b'], ['b', 'b']], '=', 4),
    ], [
      newAction([['b', 'b']], '=', 6),
    ]);
  });
});
