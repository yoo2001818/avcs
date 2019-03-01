import { Action } from './type';

type GraphEntry<T, U> = {
  parentId: string[],
  childIds: string[],
  action: Action<T, U>,
};

export async function * getGraph<T, U>(
  startId: string,
  getHistory: (actionId: string) => AsyncIterableIterator<Action<T, U>>,
): AsyncIterableIterator<GraphEntry<T, U>> {
  const branches: AsyncIterableIterator<Action<T, U>>[] =
    [getHistory(startId)];
  // *
  // |\
  // |*
  // *|
  // |/
  // *
}
