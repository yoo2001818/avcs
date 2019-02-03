import { Action, ActionScope } from '../type';

export type ActionDomain<T, U> = {
  id: number,
  children: { [key: string]: ActionDomain<T, U> },
  modifyType: number | null | false,
  triggered: boolean,
  actions: { order: number, action: Action<T, U> }[],
  aliases: string[][],
};

function createDomain<T, U>(id: number): ActionDomain<T, U> {
  return {
    id,
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
  let nodeId: number = 1;
  const root: ActionDomain<T, U> = createDomain(0);
  // Action with multiple scopes actually performs a merger - both domains
  // becomes the same.
  // 'Merged' scopes must ascend until mutual parent node is met, because,
  // if a conflict occurs in any parent node, it has to be resolved with the
  // merged node (basically, scope must be merged when conflict occurs)
  let order = 0;
  for (const action of actions) {
    const seenTable: { [key: number]: boolean } = {};
    const orderedAction = { order, action };
    const scopes = getScopes(action);
    order += 1;
    scopes.forEach((scope) => {
      if (seenTable[root.id] !== true) {
        seenTable[root.id] = true;
        root.actions.push(orderedAction);
      }
      if (scope.keys.length === 0) claimDomain(root, scope);
      else root.modifyType = false;
      scope.keys.reduce(
        (node, key, i) => {
          let child = node.children[key];
          if (child == null) {
            child = node.children[key] = createDomain(nodeId);
            nodeId += 1;
          }
          if (seenTable[child.id] !== true) {
            seenTable[child.id] = true;
            child.actions.push(orderedAction);
          }
          if (i === scope.keys.length - 1) claimDomain(child, scope);
          else child.modifyType = false;
          return child;
        },
        root);
    });
  }
  return root;
}
