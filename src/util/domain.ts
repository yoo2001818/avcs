import { Action, ActionScope } from '../type';

export type ActionDomain<T, U> = {
  id: number,
  children: { [key: string]: ActionDomain<T, U> },
  modifyType: number | null | false,
  hasAlias: boolean,
  triggered: boolean,
  actions: { order: number, action: Action<T, U> }[],
  aliases: (string | number)[][],
};

function createDomain<T, U>(id: number): ActionDomain<T, U> {
  return {
    id,
    children: {},
    modifyType: null,
    hasAlias: false,
    triggered: false,
    actions: [],
    aliases: [],
  };
}

function claimDomain<T, U>(domain: ActionDomain<T, U>, scope: ActionScope) {
  domain.triggered = true;
  if (scope.modifyType !== null) {
    if (domain.modifyType === null) {
      domain.modifyType = scope.modifyType;
    } else if (domain.modifyType !== scope.modifyType) {
      domain.modifyType = false;
    }
  } else {
    domain.modifyType = false;
  }
}

function getActionScopes<T, U>(
  action: Action<T, U>,
  getScopes: (data: T) => ActionScope[],
): ActionScope[] {
  if (action.type === 'normal') {
    return getScopes(action.data);
  }
  if (action.type === 'merge') {
    const result: ActionScope[] = [];
    action.parents.forEach((parent) => {
      parent.data.forEach((data) => {
        getScopes(data).forEach(scope => result.push(scope));
      });
    });
    return result;
  }
  return [];
}

export default function getDomains<T, U>(
  actions: Iterable<Action<T, U>>,
  getScopes: (data: T) => ActionScope[],
): ActionDomain<T, U> {
  let nodeId: number = 1;
  const root: ActionDomain<T, U> = createDomain(0);
  // Action with multiple scopes actually performs a merger - both domains
  // becomes the same.
  // 'Merged' scopes must ascend until mutual parent node is met, because,
  // if a conflict occurs in any parent node, it has to be resolved with the
  // merged node (basically, scope must be merged when conflict occurs)
  let order = 0;
  for (const action of actions) {
    const orderedAction = { order, action };
    const scopes = getActionScopes(action, getScopes);
    order += 1;
    root.actions.push(orderedAction);
    if (scopes.every(v => v.keys.length === 0)) {
      scopes.forEach(scope => claimDomain(root, scope));
    } else {
      root.modifyType = false;
    }
    for (let i = 1; i < scopes.length; i += 1) {
      if (scopes[0].keys[0] !== scopes[i].keys[0]) {
        root.hasAlias = true;
        break;
      }
    }
    let depth = 0;
    let hasMore = false;
    const domains = scopes.map(() => root);
    do {
      hasMore = false;
      for (let i = 0; i < scopes.length; i += 1) {
        const scope = scopes[i];
        const node = domains[i];
        if (depth >= scope.keys.length) continue;
        hasMore = depth < scope.keys.length;
        const key = scope.keys[depth];

        let child = node.children[key];
        if (child == null) {
          child = node.children[key] = createDomain(nodeId);
          nodeId += 1;
        }
        if (depth === scope.keys.length - 1) claimDomain(child, scope);
        else child.modifyType = false;
        domains[i] = child;
      }
      // Alias checking
      for (let i = 1; i < scopes.length; i += 1) {
        if (domains[0] !== domains[i] ||
          scopes[0].keys[depth + 1] !== scopes[i].keys[depth + 1]
        ) {
          for (let i = 0; i < scopes.length; i += 1) {
            domains[i].hasAlias = true;
          }
          break;
        }
      }
      for (let i = 0; i < scopes.length; i += 1) {
        const scope = scopes[i];
        const node = domains[i];
        if (depth >= scope.keys.length) continue;
        let hasConflictBefore = false;
        let hasConflict = false;
        for (let j = 0; j < scopes.length; j += 1) {
          if (domains[j] === node && i !== j) {
            hasConflict = j > i;
            hasConflictBefore = true;
          }
        }
        if (!hasConflict) {
          node.actions.push(orderedAction);
        }
        if (!hasConflictBefore) {
          for (let j = 0; j < scopes.length; j += 1) {
            if (j !== i) {
              domains[j].aliases.push(scope.keys);
            }
          }
        }
      }
      depth += 1;
    } while (hasMore);
  }
  return root;
}
