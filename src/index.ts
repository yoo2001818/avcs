type Action = {
  type: 'set' | 'increment' | 'decrement' | 'remove',
  key: string[],
  value: any
};

export function getActionScopes (action: Action): ([string[], string])[] {
  if (['increment', 'decrement'].includes(action.type)) {
    return [[action.key, 'add']];
  }
  return [[action.key, null]];
}

export async function merge (
  offendingScope: string[][], local: Action[], remote: Action[]
) {
  return {
    local: [] as Action[],
    remote: [] as Action[]
  };
}
