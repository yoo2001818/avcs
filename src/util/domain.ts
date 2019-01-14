import { Action, ActionScope } from '../type';

export type ActionDomain<T, U> = {
  children: { [key: string]: ActionDomain<T, U> },
  modifyType: number | null | false,
  actions: Action<T, U>[],
};

export default function getDomains<T, U>(
  actions: Iterable<Action<T, U>>,
  getScopes: (action: Action<T, U>) => ActionScope[],
): ActionDomain<T, U> {
  let root: ActionDomain<T, U> = {
    children: {},
    modifyType: undefined,
    actions: [],
  };
  for (let action of actions) {
    let scopes = getScopes(action);
    scopes.forEach(scope => {
      scope.keys.reduce((node, key, i) => {
      }, root);
    });
  }
  return root;
}
