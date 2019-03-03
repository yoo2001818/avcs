import { Action } from './type';

type GraphEntry<T, U> = {
  parentId: string[],
  childIds: string[],
  action: Action<T, U>,
};

type GraphBranch<T, U> = {
  action: Action<T, U>,
  done: boolean,
  iterator: AsyncIterableIterator<Action<T, U>>,
};

async function createBranch<T, U>(
  id: string,
  getHistory: (actionId: string) => AsyncIterableIterator<Action<T, U>>,
): Promise<GraphBranch<T, U>> {
  const iterator = getHistory(id);
  const result = await iterator.next();
  return {
    iterator,
    action: result.value,
    done: result.done,
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
  startId: string,
  getHistory: (actionId: string) => AsyncIterableIterator<Action<T, U>>,
): AsyncIterableIterator<GraphEntry<T, U>> {
  const branches: GraphBranch<T, U>[] =
    [await createBranch(startId, getHistory)];
  while (branches.length > 0) {
    const branchId = getShallowestBranchId(branches);
    const branch = branches[branchId];
    const { action, iterator } = branch;
    if (action.type === 'merge') {
      for (let i = 1; i < action.parents.length; i += 1) {
        branches.push(await createBranch(action.parents[i].id, getHistory));
      }
    }
    const result = await iterator.next();
    branch.action = result.value;
    branch.done = result.done;
  }
}
