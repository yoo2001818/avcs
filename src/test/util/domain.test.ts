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
      modifyType: null,
      triggered: false,
      children: {
        users: {
          actions: [action, action2],
          modifyType: null,
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
});
