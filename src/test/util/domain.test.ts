import { Action, ActionScope } from '../../type';
import getDomains from '../../util/domain';

function getScopes(data: ActionScope[]): ActionScope[] {
  return data;
}

function newAction(scope: ActionScope[]): Action<ActionScope[], {}> {
  return {
    id: '',
    type: 'normal',
    data: scope,
    depth: 0,
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
      hasAlias: false,
      aliases: [],
      id: 0,
      children: {
        users: {
          actions: [actionData, actionData2],
          modifyType: false,
          triggered: false,
          hasAlias: false,
          aliases: [],
          id: 1,
          children: {
            count: {
              actions: [actionData],
              modifyType: 1,
              triggered: true,
              hasAlias: false,
              children: {},
              aliases: [],
              id: 2,
            },
            name: {
              actions: [actionData2],
              modifyType: false,
              triggered: true,
              hasAlias: false,
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
      hasAlias: false,
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
      hasAlias: false,
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
      hasAlias: false,
      aliases: [],
      id: 0,
      children: {
        a: {
          actions: [actionData2],
          modifyType: 1,
          triggered: true,
          hasAlias: false,
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
      hasAlias: false,
      aliases: [],
      id: 0,
      children: {
        a: {
          actions: [actionData],
          modifyType: false,
          triggered: false,
          hasAlias: true,
          aliases: [],
          id: 1,
          children: {
            a: {
              actions: [actionData],
              modifyType: 1,
              triggered: true,
              hasAlias: true,
              aliases: [['a', 'b']],
              id: 2,
              children: {},
            },
            b: {
              actions: [actionData],
              modifyType: 1,
              triggered: true,
              hasAlias: true,
              aliases: [['a', 'a']],
              id: 3,
              children: {},
            },
          },
        },
      },
    });
  });
  it('should register alias when child diverges', () => {
    const action = newAction([
      { keys: ['a', 'a'], modifyType: 1 },
      { keys: ['b', 'b'], modifyType: 1 },
    ]);
    const actionData = { action, order: 0 };
    expect(getDomains([action], getScopes)).toEqual({
      actions: [actionData],
      modifyType: false,
      triggered: false,
      hasAlias: true,
      aliases: [],
      id: 0,
      children: {
        a: {
          actions: [actionData],
          modifyType: false,
          triggered: false,
          hasAlias: true,
          aliases: [['b', 'b']],
          id: 1,
          children: {
            a: {
              actions: [actionData],
              modifyType: 1,
              triggered: true,
              hasAlias: true,
              aliases: [['b', 'b']],
              id: 3,
              children: {},
            },
          },
        },
        b: {
          actions: [actionData],
          modifyType: false,
          triggered: false,
          hasAlias: true,
          aliases: [['a', 'a']],
          id: 2,
          children: {
            b: {
              actions: [actionData],
              modifyType: 1,
              triggered: true,
              hasAlias: true,
              aliases: [['a', 'a']],
              id: 4,
              children: {},
            },
          },
        },
      },
    });
  });
});
