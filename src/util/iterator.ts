export async function * separateBulk<T>(
  getNext: () => Promise<T[]>,
): AsyncIterator<T> {
  let buffer: T[] = [];
  let pos = 0;
  do {
    if (pos <= buffer.length) {
      buffer = await getNext();
      pos = 0;
      if (buffer.length === 0) return;
    }
    yield buffer[pos];
    pos += 1;
  } while (true);
}
