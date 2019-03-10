import { Action } from '../type';
import { getGraph, GraphEntry } from './graph';

export default async function * printLog<T, U>(
  renderAction: (action: Action<T, U>) => string,
  iterator: AsyncIterable<GraphEntry<T, U>>,
): AsyncIterableIterator<string> {
  const branches: string[] = [];
  for await (const entry of iterator) {
    // Merge - connect between two branches
    // | | |    | | |
    // |/ /     | _/
    // | |      |/
    // | |      | |
    let branchId: number = null;
    for (let i = 0; i < branches.length; i += 1) {
      if (branches[i] === entry.action.id) {
        if (branchId === null) {
          branchId = i;
        } else {
          if (i === branchId + 1) {
            // Merge (zipper)
            // | |
            // |/
            // |
            yield (
              branches.slice(0, branchId + 1).map(() => '|').join(' ') +
              branches.slice(branchId + 1).map(() => '/').join(' '));
            branches.splice(i, 1);
            i -= 1;
            yield branches.map(() => '|').join(' ');
          } else {
            // Merge (cross)
            // | | |
            // | _/
            // |/|
            // | |
            yield (
              branches.slice(0, branchId + 1).map(() => '|').join(' ') +
              ' ' +
              branches.slice(branchId + 1, i).map(() => '__').join('') +
              '/ ' +
              branches.slice(i + 1).map(() => '|').join(' ')
            );
            branches.splice(i, 1);
            i -= 1;
            yield (
              branches.slice(0, branchId + 1).map(() => '|').join(' ') +
              '/' +
              branches.slice(branchId + 1, i + 1).map(() => ' ').join(' ') +
              '  ' +
              branches.slice(i + 1).map(() => '/').join(' ')
            );
          }
        }
      }
    }
    if (branchId === null) {
      branches.push(entry.action.id);
      branchId = branches.length - 1;
    }
    yield (
      branches.map(v => v === entry.action.id ? '*' : '|').join(' ') +
      ' ' +
      renderAction(entry.action));
    // Diverge - allocate new branch between them.
    // As you can see, other branches are pushed to right - new branches
    // are inserted right next to current branch.
    // | |
    // |\ \
    // | | |
    // |\ \ \
    // | | | |
    for (let i = 0; i < entry.parentIds.length; i += 1) {
      if (i === 0) {
        branches[branchId] = entry.parentIds[i];
        continue;
      }
      yield (
        branches.slice(0, branchId + 1).map(() => '|').join(' ') +
        branches.slice(branchId).map(() => '\\').join(' '));
      branches.splice(branchId + i, 0, entry.parentIds[i]);
      yield branches.map(() => '|').join(' ');
    }
  }
}
