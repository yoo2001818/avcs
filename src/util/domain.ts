import { Action, ActionScope } from '../type';

export type ActionDomain<T, U> = {
  children: { [key: string]: ActionDomain<T, U> },
  modifyType: number | null | false,
  triggered: boolean,
  actions: { order: number, action: Action<T, U> }[],
  aliases: string[][],
};

function createDomain<T, U>(): ActionDomain<T, U> {
  return {
    children: {},
    modifyType: null,
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
  // It is not desirable to do merging here, as we're uncertain about other
  // merging end - therefore we should at least, retain the order of the actions
  // and the aliases.
  let order = 0;
  for (const action of actions) {
    const orderedAction = { order, action };
    const scopes = getScopes(action);
    order += 1;
    // The scopes MUST be exclusive - i.e.
    // a.b.c, a.b can't coexist. But a.b.c, a.b.d can coexist.
    scopes.forEach((scope) => {
      root.actions.push(orderedAction);
      if (scope.keys.length === 0) claimDomain(root, scope);
      else root.modifyType = false;
      scope.keys.reduce(
        (node, key, i) => {
          let child = node.children[key];
          if (child == null) {
            child = node.children[key] = createDomain();
          }
          child.actions.push(orderedAction);
          if (i === scope.keys.length - 1) claimDomain(child, scope);
          else child.modifyType = false;
          return child;
        },
        root);
    });
  }
  return root;
}
