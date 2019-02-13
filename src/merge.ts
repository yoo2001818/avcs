import { Action, MachineConfig } from './type';
import getDomain, { ActionDomain } from './util/domain';

export default async function merge<T, U>(
  left: Action<T, U>[],
  right: Action<T, U>[],
  config: MachineConfig<T, U>,
) {
  const leftRoot = getDomain(left, config.getScopes);
  const rightRoot = getDomain(right, config.getScopes);
  const leftOutput: Action<T, U>[] = [];
  const rightOutput: Action<T, U>[] = [];
  const leftSkipNodes: { [key: number]: true } = {};
  const rightSkipNodes: { [key: number]: true } = {};
  const queue: {
    left: ActionDomain<T, U>,
    right: ActionDomain<T, U>,
    path: (string | number)[],
  }[] = [{ left: leftRoot, right: rightRoot, path: [] }];
  // Traverse down the tree, and detect any confliction.
  // The confliction must be small as possible - it's okay to issue more than
  // two merge conflicts, as we can ensure that their orders don't need to be
  // preserved.
  // However, if a single action is involved in two or more conflicts, they
  // MUST be treated as whole, otherwise it'll be executed multiple times.
  while (queue.length > 0) {
    const { left, right, path } = queue.shift();
    if (leftSkipNodes[left.id] || rightSkipNodes[right.id]) {
      // We've already processed this node; skip it.
      continue;
    }
    // Check if both left / right has children node. If one of them
    // doesn't have one, we can just go ahead and use the other.
    if (left == null || left.actions.length === 0) {
      right.actions.forEach(v => leftOutput.push(v.action));
      continue;
    }
    if (right == null || right.actions.length === 0) {
      left.actions.forEach(v => rightOutput.push(v.action));
      continue;
    }
    if (!left.triggered && !right.triggered) {
      // Merge its children without any order (it shouldn't matter.)
      for (const key in left.children) {
        queue.push({
          left: left.children[key],
          right: right.children[key],
          path: [...path, key],
        });
      }
      for (const key in right.children) {
        if (left.children[key] != null) continue;
        queue.push({
          left: left.children[key],
          right: right.children[key],
          path: [...path, key],
        });
      }
      continue;
    }
    // In order for conflict to occur, all of these must be true:
    // 1. Both has actions inside the node.
    // 2. One of them has triggered that specific node.
    // 3. modifyType is both false, or does not equal to each other.
    // If this happens, we can just pass these all actions to merge conflict
    // handler, and use its results to merge them.
    //
    // However, an action can reside in multiple scopes. If that happens, and
    // merge conflict occurs, we must treat them as same - both 'a' and 'b'
    // domain must be treated as whole.
    //
    // Check if the node is compatiable, so it can be merged together without
    // any problem.
    if (left.modifyType === false || left.modifyType !== right.modifyType) {
      if (left.aliases.length !== 0 || right.aliases.length !== 0) {
        // Fetch the other node and merge with it.
        let leftNodes = left.aliases.map(path => findNode(leftRoot, path));
        let rightNodes = right.aliases.map(path => findNode(rightRoot, path));
      }
      // It's not. Launch conflict resolution.
      const result = await config.merge(
        path,
        left.actions.map(v => v.action),
        right.actions.map(v => v.action));
      result.left.forEach(v => rightOutput.push(v));
      result.right.forEach(v => leftOutput.push(v));
    } else {
      // Otherwise, merge them in any order.
      left.actions.forEach(v => rightOutput.push(v.action));
      right.actions.forEach(v => leftOutput.push(v.action));
    }
  }
  return { left: leftOutput, right: rightOutput };
}

async function findNode<T, U>(
  root: ActionDomain<T, U>,
  path: (string | number)[],
) {
  return path.reduce((prev, segment) => prev.children[segment], root);
}
