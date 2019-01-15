import { Action, ActionScope } from '../type';

export type ActionDomain<T, U> = {
  children: { [key: string]: ActionDomain<T, U> },
  modifyType: number | null | false,
  triggered: boolean,
  actions: Action<T, U>[],
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

export default function getDomains<T, U>(
  actions: Iterable<Action<T, U>>,
  getScopes: (action: Action<T, U>) => ActionScope[],
): ActionDomain<T, U> {
  const root: ActionDomain<T, U> = createDomain();
  for (const action of actions) {
    const scopes = getScopes(action);
    // The scopes MUST be exclusive - i.e.
    // a.b.c, a.b can't coexist. But a.b.c, a.b.d can coexist.
    scopes.forEach((scope) => {
      root.actions.push(action);
      if (scope.keys.length === 0) claimDomain(root, scope);
      scope.keys.reduce(
        (node, key, i) => {
          let child = node.children[key];
          if (child == null) {
            child = node.children[key] = createDomain();
          }
          child.actions.push(action);
          if (i === scope.keys.length - 1) claimDomain(child, scope);
          return child;
        },
        root);
    });
  }
  return root;
}
