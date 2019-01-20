import { Action, MachineConfig } from './type';
import getDomain, { ActionDomain } from './util/domain';

export default function merge<T, U>(
  left: Action<T, U>[],
  right: Action<T, U>[],
  config: MachineConfig<T, U>,
) {
  let leftDomain = getDomain(left, config.getScopes);
  let rightDomain = getDomain(right, config.getScopes);
  // Traverse down the tree, and detect any confliction.
  // The confliction must be small as possible - it's okay to issue more than
  // two merge conflicts, as we can ensure that their orders don't need to be
  // preserved.
  // However, if a single action is involved in two or more conflicts, they
  // MUST be treated as whole, otherwise it'll be executed multiple times.

  // Recursively traverse down the tree.
  mergeLevel(leftDomain, rightDomain, config);
}

function mergeLevel<T, U>(
  left: ActionDomain<T, U>,
  right: ActionDomain<T, U>,
  config: MachineConfig<T, U>,
): { left: Action<T, U>[], right: Action<T, U>[] } {
  // Check if both left / right has children node. If one of them
  // doesn't have one, we can just go ahead and use the other.
  if (left == null || left.actions.length === 0) {
    return { left: right.actions, right: right.actions };
  }
  if (right == null || right.actions.length === 0) {
    return { left: left.actions, right: left.actions };
  }
  // Otherwise, traverse down.
  // In order for conflict to occur, all of these must be true:
  // 1. Both has actions inside the node.
  // 2. One of them has triggered that specific node.
  // 3. modifyType is both false, or does not equal to each other.
  // If this happens, we can just pass these all actions to merge conflict
  // handler, and use its results to merge them.
  //
  // However, an action can reside in multiple scopes. If that happens, and
  // merge conflict occurs, we must treat them as same - both 'a' and 'b' domain
  // must be treated as whole.
  return { left: [], right: [] };
}
