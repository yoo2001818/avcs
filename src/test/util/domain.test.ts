import { Action, ActionScope } from '../../type';
import getDomains from '../../util/domain';

function getScopes(action: Action<ActionScope[], {}>): ActionScope[] {
  if (action.type === 'normal') {
    return action.data;
  }
  return [];
}

function newAction(scope: ActionScope[]): Action<ActionScope[], {}> {
  return {
    id: '',
    type: 'normal',
    data: scope,
    undoData: {},
    parent: '',
  };
}

describe('getDomains', () => {
  it('should create a tree', () => {
    const action = newAction([{ keys: ['users', 'count'], modifyType: 1 }]);
    const action2 = newAction([{ keys: ['users', 'name'], modifyType: null }]);
    expect(getDomains([action, action2], getScopes)).toEqual({
      actions: [action, action2],
      modifyType: false,
      triggered: false,
      children: {
        users: {
          actions: [action, action2],
          modifyType: false,
          triggered: false,
          children: {
            count: {
              actions: [action],
              modifyType: 1,
              triggered: true,
              children: {},
            },
            name: {
              actions: [action2],
              modifyType: false,
              triggered: true,
              children: {},
            },
          },
        },
      },
    });
  });
  it('should keep modify type if possible', () => {
    const action = newAction([{ keys: [], modifyType: 1 }]);
    expect(getDomains([action, action], getScopes)).toEqual({
      actions: [action, action],
      modifyType: 1,
      triggered: true,
      children: {},
    });
  });
  it('should invalidate modify type', () => {
    const action = newAction([{ keys: [], modifyType: 1 }]);
    const action2 = newAction([{ keys: [], modifyType: 2 }]);
    expect(getDomains([action, action2], getScopes)).toEqual({
      actions: [action, action2],
      modifyType: false,
      triggered: true,
      children: {},
    });
  });
  it('should invalidate modify type if child exists', () => {
    const action = newAction([{ keys: [], modifyType: 1 }]);
    const action2 = newAction([{ keys: ['a'], modifyType: 1 }]);
    expect(getDomains([action, action2], getScopes)).toEqual({
      actions: [action, action2],
      modifyType: false,
      triggered: true,
      children: {
        a: {
          actions: [action2],
          modifyType: 1,
          triggered: true,
          children: {},
        },
      },
    });
  });
});
