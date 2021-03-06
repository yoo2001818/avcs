import { Action, MachineConfig } from './type';
import getDomain, { ActionDomain } from './util/domain';

function findNode<T, U>(
  root: ActionDomain<T, U>,
  path: (string | number)[],
) {
  return path.reduce(
    (prev, segment) => prev == null ? null : prev.children[segment],
    root);
}

function dedupePaths(paths: (string | number)[][]) {
  // TODO It should be optimizied (can it be?)
  const output: (string | number)[][] = [];
  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i];
    let hasConflict: boolean = false;
    for (let j = 0; j < i; j += 1) {
      if (path.length === paths[j].length &&
        path.every((v, k) => v === paths[j][k])
      ) {
        hasConflict = true;
        break;
      }
    }
    if (!hasConflict) output.push(path);
  }
  return output;
}

function mergeBuckets<T>(buckets: T[][], getValue: (value: T) => number) {
  let bucketsBuf = buckets.slice();
  const bucketsIndex = buckets.map(() => 0);
  const output: T[] = [];
  while (bucketsBuf.length > 0) {
    let smallest: T = null;
    let smallestIndex: number = null;
    let smallestValue: number = null;
    for (let i = 0; i < bucketsBuf.length; i += 1) {
      const bucket = bucketsBuf[i];
      const index = bucketsIndex[i];
      if (bucket.length <= index) {
        bucketsBuf = bucketsBuf.filter((_, j) => j !== i);
        i -= 1;
        continue;
      }
      const id = getValue(bucket[index]);
      if (smallestValue == null || id < smallestValue) {
        smallestValue = id;
        smallest = bucket[index];
        smallestIndex = i;
      }
    }
    if (smallest != null) {
      bucketsIndex[smallestIndex] += 1;
      output.push(smallest);
    }
  }
  return output;
}

type MergePair<V> = { left: V, right: V };

type MergeContext<T, U, V> = {
  config: MachineConfig<T, U, V>,
  root: MergePair<ActionDomain<T, U>>,
  output: MergePair<Action<T, U>[]>,
  skipNodes: MergePair<{ [key: number]: true }>,
};

export async function mergeLevel<T, U, V>(
  path: (string | number)[],
  left: ActionDomain<T, U> | null,
  right: ActionDomain<T, U> | null,
  context: MergeContext<T, U, V>,
): Promise<MergePair<Action<T, U>[]>> {
  /*
   * L/R    null     alias    trig   norm     empty
   * null   D/C      -        -      -        -
   * alias  descend  descend  -      -        -
   * trig   merge    merge    merge  -        -
   * norm   prune    descend  merge  descend  -
   * empty  D/C      descend  prune  prune    prune
   */
  // Check if we've already process this node.
  if (left != null && context.skipNodes.left[left.id]) return context.output;
  if (right != null && context.skipNodes.right[right.id]) return context.output;
  // If left / right is null or empty, and the other one doesn't have any
  // aliases, we can just go ahead and use the other.
  if (left != null && !left.hasAlias) {
    if (right == null || right.actions.length === 0) {
      left.actions.forEach(v => context.output.right.push(v.action));
      return context.output;
    }
  }
  if (right != null && !right.hasAlias) {
    if (left == null || left.actions.length === 0) {
      right.actions.forEach(v => context.output.left.push(v.action));
      return context.output;
    }
  }
  // Run merge logic if one of them is triggered, or has direct aliases.
  const leftTriggered = left != null && left.triggered;
  const rightTriggered = right != null && right.triggered;
  if (leftTriggered || rightTriggered) {
    const additionalPaths = dedupePaths([
      ...left != null ? left.aliases : [],
      ...right != null ? right.aliases : [],
    ]);
    const leftNodes =
      additionalPaths.map(path => findNode(context.root.left, path));
    const rightNodes =
      additionalPaths.map(path => findNode(context.root.right, path));
    const hasConflict = left != null && right != null &&
      (left.modifyType === false || left.modifyType !== right.modifyType);
    const isLeftAliasOccupied = leftNodes.some(node => node.triggered);
    const isRightAliasOccupied = rightNodes.some(node => node.triggered);
    // In order for conflict to occur, all of these must be true:
    // 1. Both side has actions inside the node.
    // 2. One of them has triggered that specific node.
    // 3. For all node pairs:
    //    modifyType is both false, or does not equal to each other.
    //    However, let's not compare against that for now...
    // If this happens, we can just pass these all actions to merge conflict
    // handler, and use its results to merge them.
    //
    // However, an action can reside in multiple scopes. If that happens, and
    // merge conflict occurs, we must treat them as same - both 'a' and 'b'
    // domain must be treated as whole.
    //
    // Check if the node is compatiable, so it can be merged together without
    // any problem.
    if (hasConflict || isLeftAliasOccupied || isRightAliasOccupied) {
      // Fetch the other node and merge with it.
      const leftActions = mergeBuckets(
        [left, ...leftNodes].filter(v => v != null).map(v => v.actions),
        v => v.order);
      const rightActions = mergeBuckets(
        [right, ...rightNodes].filter(v => v != null).map(v => v.actions),
        v => v.order);
      const paths = [path, ...additionalPaths];
      const result = await context.config.merge(
        paths,
        leftActions.map(v => v.action),
        rightActions.map(v => v.action));
      leftNodes.forEach(({ id }) => context.skipNodes.left[id] = true);
      rightNodes.forEach(({ id }) => context.skipNodes.right[id] = true);
      result.left.forEach(v => context.output.left.push(v));
      result.right.forEach(v => context.output.right.push(v));
    } else {
      // Otherwise, merge them in any order.
      left.actions.forEach(v => context.output.right.push(v.action));
      right.actions.forEach(v => context.output.left.push(v.action));
    }
    return context.output;
  }
  // Otherwise, directly descend into its children.
  if (left != null) {
    for (const key in left.children) {
      await mergeLevel(
        [...path, key],
        left.children[key],
        right && right.children[key],
        context);
    }
  }
  if (right != null) {
    for (const key in right.children) {
      if (left != null && left.children[key] != null) continue;
      await mergeLevel(
        [...path, key],
        left && left.children[key],
        right.children[key],
        context);
    }
  }
  return context.output;
}

export default async function merge<T, U, V>(
  left: Action<T, U>[],
  right: Action<T, U>[],
  config: MachineConfig<T, U, V>,
) {
  const leftRoot = getDomain(left, config.getScopes);
  const rightRoot = getDomain(right, config.getScopes);
  return mergeLevel([], leftRoot, rightRoot, {
    config,
    root: { left: leftRoot, right: rightRoot },
    output: { left: [], right: [] },
    skipNodes: { left: {}, right: {} },
  });
}
