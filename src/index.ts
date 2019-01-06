import Machine from './machine';
import MemoryStorage from './storage/memory';

type Action = {
  type: 'set' | 'increment' | 'decrement',
  key: string[],
  value?: any,
};

const machine = new Machine(null, new MemoryStorage());
