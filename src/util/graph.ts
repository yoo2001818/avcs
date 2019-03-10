import { Action } from '../type';

export type GraphEntry<T, U> = {
  parentIds: string[],
  childIds: string[],
  action: Action<T, U>,
};

type GraphBranch<T, U> = {
  prevAction: Action<T, U> | null,
  action: Action<T, U>,
  done: boolean,
  processed: boolean,
  iterator: AsyncIterableIterator<Action<T, U>>,
};

async function createBranch<T, U>(
  getHistory: (actionId: string) => AsyncIterableIterator<Action<T, U>>,
  id?: string,
  prevAction?: Action<T, U>,
): Promise<GraphBranch<T, U>> {
  const iterator = getHistory(id);
  const result = await iterator.next();
  return {
    iterator,
    prevAction: prevAction || null,
    action: result.value,
    done: result.done,
    processed: false,
  };
}

function getShallowestBranchId<T, U>(branches: GraphBranch<T, U>[]): number {
  let targetId = 0;
  let targetDepth = 0;
  for (let i = 0; i < branches.length; i += 1) {
    const depth = branches[i].action.depth;
    if (depth > targetDepth) {
      targetId = i;
      targetDepth = depth;
    }
  }
  return targetId;
}

export async function * getGraph<T, U>(
  getHistory: (actionId: string) => AsyncIterableIterator<Action<T, U>>,
  startId?: string,
): AsyncIterableIterator<GraphEntry<T, U>> {
  let branches: GraphBranch<T, U>[] =
    [await createBranch(getHistory, startId)];
  while (branches.length > 0) {
    const branchId = getShallowestBranchId(branches);
    const branch = branches[branchId];
    const { action, prevAction, done, processed, iterator } = branch;
    if (done) continue;
    if (!processed) {
      // We have to emit the action if all other branches has lower depth, or
      // same depth. However, this is already ensured since we fetch the branch
      // with highest depth.

      // However, in order to merge other actions, emit should be avoided when
      // same depths are present. Since all other branches should have reached
      // the same action if possible, we can just check if other branches have
      // reached there, and advance all of them.
      const childIds: string[] = [];
      if (prevAction != null) {
        childIds.push(prevAction.id);
      }
      for (let i = 0; i < branches.length; i += 1) {
        const target = branches[i];
        if (i !== branchId && !target.done && target.action.id === action.id) {
          childIds.push(target.prevAction.id);
          target.processed = true;
        }
      }
      let parentIds: string[];
      switch (action.type) {
        case 'merge':
          parentIds = action.parents.map(v => v.id);
          break;
        case 'normal':
          parentIds = [action.parent];
          break;
        case 'init':
          parentIds = [];
          break;
      }
      yield { parentIds, childIds, action };
    }
    if (action.type === 'merge') {
      for (let i = 1; i < action.parents.length; i += 1) {
        branches.push(await createBranch(
          getHistory, action.parents[i].id, action));
      }
    }
    const result = await iterator.next();
    branch.prevAction = branch.action;
    branch.action = result.value;
    branch.done = result.done;
    branch.processed = false;
    if (branch.done) {
      branches = branches.filter((_, i) => i !== branchId);
    }
  }
}
