import { Action, ActionScope } from '../type';

export type ActionDomain<T, U> = {
  children: { [key: string]: ActionDomain<T, U> },
  modifyType: number | null | false,
  triggered: boolean,
  actions: { order: number, action: Action<T, U> }[],
};

function createDomain<T, U>(): ActionDomain<T, U> {
  return {
    children: {},
    modifyType: null,
    triggered: false,
    actions: [],
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

type Visited = { [key: string]: Visited };

export default function getDomains<T, U>(
  actions: Iterable<Action<T, U>>,
  getScopes: (action: Action<T, U>) => ActionScope[],
): ActionDomain<T, U> {
  const root: ActionDomain<T, U> = createDomain();
  // Action with multiple scopes actually performs a merger - both domains
  // becomes the same.
  //
  // In order to do that, we first populate the domains with 'portal', or,
  // 'tombstone', indicating that the resource has gone to there, not here.
  //
  // However, this even adds more difficulty -
  // root - a - a
  //      \ b - b
  // If an action specifies a.a and b.b as its domain, since an action occur
  // only once in the tree, a and b as whole must be merged as well. (That is,
  // if conflict occurs inside there.)
  //
  for (const action of actions) {
  }
  let actionOrder: number = 0;
  for (const action of actions) {
    const scopes = getScopes(action);
    let visited: Visited = null;
    // The scopes MUST be exclusive - i.e.
    // a.b.c, a.b can't coexist. But a.b.c, a.b.d can coexist.
    scopes.forEach((scope) => {
      let currentVisited = visited;
      if (currentVisited == null) {
        currentVisited = visited = {};
        root.actions.push({ action, order: actionOrder });
      }
      if (scope.keys.length === 0) claimDomain(root, scope);
      else root.modifyType = false;
      scope.keys.reduce(
        (node, key, i) => {
          let child = node.children[key];
          if (child == null) {
            child = node.children[key] = createDomain();
          }
          let visitedChild = currentVisited[key];
          if (visitedChild == null) {
            visitedChild = currentVisited[key] = {};
            child.actions.push({ action, order: actionOrder });
          }
          if (i === scope.keys.length - 1) claimDomain(child, scope);
          else child.modifyType = false;
          return child;
        },
        root);
      actionOrder += 1;
    });
  }
  return root;
}
