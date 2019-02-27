import { Action } from '../type';

export function convertActionsToMergeData<T, U>(
  newId: string,
  actions: Action<T, U>[],
  parentId: string,
) {
  const result: T[] = [];
  const undoResult: U[] = [];
  actions.forEach((action, i) => {
    if (action.type === 'normal') {
      result.push(action.data);
      undoResult.push(action.undoData);
    } else if (action.type === 'merge') {
      let currentId: string;
      if (i < actions.length - 1) {
        currentId = actions[i + 1].id;
      } else {
        currentId = parentId;
      }
      const parent = action.parents.find(v => v.id === currentId);
      if (parent == null) {
        throw new Error('Failed to get parent for the merge action');
      }
      parent.data.forEach(v => result.push(v));
      parent.undoData.forEach(v => undoResult.push(v));
    }
  });
  return { id: newId, data: result, undoData: undoResult };
}
