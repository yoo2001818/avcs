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
    const actionData = { action, order: 0 };
    const actionData2 = { action: action2, order: 1 };
    expect(getDomains([action, action2], getScopes)).toEqual({
      actions: [actionData, actionData2],
      modifyType: false,
      triggered: false,
      aliases: [],
      id: 0,
      children: {
        users: {
          actions: [actionData, actionData2],
          modifyType: false,
          triggered: false,
          aliases: [],
          id: 1,
          children: {
            count: {
              actions: [actionData],
              modifyType: 1,
              triggered: true,
              children: {},
              aliases: [],
              id: 2,
            },
            name: {
              actions: [actionData2],
              modifyType: false,
              triggered: true,
              children: {},
              aliases: [],
              id: 3,
            },
          },
        },
      },
    });
  });
  it('should keep modify type if possible', () => {
    const action = newAction([{ keys: [], modifyType: 1 }]);
    const actionData = { action, order: 0 };
    const actionData2 = { action, order: 1 };
    expect(getDomains([action, action], getScopes)).toEqual({
      actions: [actionData, actionData2],
      modifyType: 1,
      triggered: true,
      aliases: [],
      id: 0,
      children: {},
    });
  });
  it('should invalidate modify type', () => {
    const action = newAction([{ keys: [], modifyType: 1 }]);
    const action2 = newAction([{ keys: [], modifyType: 2 }]);
    const actionData = { action, order: 0 };
    const actionData2 = { action: action2, order: 1 };
    expect(getDomains([action, action2], getScopes)).toEqual({
      actions: [actionData, actionData2],
      modifyType: false,
      triggered: true,
      aliases: [],
      id: 0,
      children: {},
    });
  });
  it('should invalidate modify type if child exists', () => {
    const action = newAction([{ keys: [], modifyType: 1 }]);
    const action2 = newAction([{ keys: ['a'], modifyType: 1 }]);
    const actionData = { action, order: 0 };
    const actionData2 = { action: action2, order: 1 };
    expect(getDomains([action, action2], getScopes)).toEqual({
      actions: [actionData, actionData2],
      modifyType: false,
      triggered: true,
      aliases: [],
      id: 0,
      children: {
        a: {
          actions: [actionData2],
          modifyType: 1,
          triggered: true,
          aliases: [],
          id: 1,
          children: {},
        },
      },
    });
  });
  it('should not add same domain twice', () => {
    const action = newAction([
      { keys: ['a', 'a'], modifyType: 1 },
      { keys: ['a', 'b'], modifyType: 1 },
    ]);
    const actionData = { action, order: 0 };
    expect(getDomains([action], getScopes)).toEqual({
      actions: [actionData],
      modifyType: false,
      triggered: false,
      aliases: [],
      id: 0,
      children: {
        a: {
          actions: [actionData],
          modifyType: false,
          triggered: false,
          aliases: [],
          id: 1,
          children: {
            a: {
              actions: [actionData],
              modifyType: 1,
              triggered: true,
              aliases: [['a', 'b']],
              id: 2,
              children: {},
            },
            b: {
              actions: [actionData],
              modifyType: 1,
              triggered: true,
              aliases: [['a', 'a']],
              id: 3,
              children: {},
            },
          },
        },
      },
    });
  });
});
