import randomstring from 'randomstring';
import { Action, MachineConfig, SyncRPCSet } from './type';
import { Storage } from './storage';
import { separateBulk } from './util/iterator';
import { convertActionsToMergeData } from './util/action';
import merge from './merge';

export default class Machine<T, U> {
  config: MachineConfig<T, U>;
  storage: Storage<T, U>;
  constructor(config: MachineConfig<T, U>, storage: Storage<T, U>) {
    this.config = config;
    this.storage = storage;
  }
  generateId(): string {
    return randomstring.generate();
  }
  async forceRun(data: T): Promise<U> {
    return this.config.run(data);
  }
  async forceRunSeries(data: T[]): Promise<U[]> {
    // TODO Transactions
    const output: U[] = [];
    for (const entry of data) {
      output.push(await this.config.run(entry));
    }
    return output;
  }
  async init(): Promise<Action<T, U>> {
    const newAction: Action<T, U> = {
      id: this.generateId(),
      type: 'init',
      depth: 0,
    };
    await this.storage.set(newAction.id, newAction);
    await this.storage.setCurrent(newAction.id);
    return newAction;
  }
  async run(data: T, undoId?: string): Promise<Action<T, U>> {
    // Run and record the action into the system.
    const currentAction = await this.storage.getCurrent();
    const undoData = await this.forceRun(data);
    const newAction: Action<T, U> = {
      data,
      undoData,
      undoId,
      id: this.generateId(),
      type: 'normal',
      parent: currentAction.id,
      depth: currentAction.depth + 1,
    };
    await this.storage.set(newAction.id, newAction);
    await this.storage.setCurrent(newAction.id);
    return newAction;
  }
  async undo(action: Action<T, U>, parentId?: string): Promise<void> {
    // TODO Determine if the action has a conflict - the scope between the
    // reversed action, and history until the action, should be compared.
    switch (action.type) {
      case 'normal':
        await this.run(
          this.config.getReverse(action.data, action.undoData), action.id);
        break;
      case 'merge':
        // TODO Which parent should be followed? In this case, the undo must
        // receive WHICH branch to undo.
    }
  }
  async forceUndo(action: Action<T, U>, parentId?: string): Promise<void> {
    switch (action.type) {
      case 'normal':
        await this.forceRun(
          this.config.getReverse(action.data, action.undoData));
        break;
      case 'merge':
        const parent = action.parents.find(v => v.id === parentId);
        if (parent == null) {
          throw new Error(`Unknown parent ID ${parentId}`);
        }
        await this.forceRunSeries(parent.data.map((item, i) =>
          this.config.getReverse(item, parent.undoData[i])));
    }
  }
  async forceRedo(action: Action<T, U>, parentId?: string): Promise<void> {
    // NOTE this reruns the given action, meaning that it doesn't reverse the
    // action. Therefore undoed action can't be passed into here.
    switch (action.type) {
      case 'normal':
        await this.forceRun(action.data);
        break;
      case 'merge':
        const parent = action.parents.find(v => v.id === parentId);
        if (parent == null) {
          throw new Error(`Unknown parent ID ${parentId}`);
        }
        await this.forceRunSeries(parent.data);
    }
  }
  async * getHistory(startId?: string): AsyncIterableIterator<Action<T, U>> {
    let action: Action<T, U>;
    if (startId != null) {
      action = await this.storage.get(startId);
    } else {
      action = await this.storage.getCurrent();
    }
    while (action != null) {
      yield action;
      let parentId;
      switch (action.type) {
        case 'normal':
          parentId = action.parent;
          break;
        case 'merge':
          // TODO Which branch should be followed? We can possibly retrieve
          // results from 'yield'.
          parentId = action.parents[0].id;
      }
      if (parentId == null) {
        break;
      } else {
        action = await this.storage.get(parentId);
      }
    }
  }
  getCurrent(): Promise<Action<T, U>> {
    return this.storage.getCurrent();
  }
  async getDivergingPath(
    left: AsyncIterator<Action<T, U>>, right: AsyncIterator<Action<T, U>>,
  ): Promise<{ left: Action<T, U>[], right: Action<T, U>[] }> {
    let leftStack: Action<T, U>[] = [];
    let rightStack: Action<T, U>[] = [];
    let leftEnded: boolean = false;
    let rightEnded: boolean = false;
    const seenTable: { [key: string]: number } = {};
    while (!leftEnded || !rightEnded) {
      const currentLeft = leftEnded ? null : (await left.next()).value;
      const currentRight = rightEnded ? null : (await right.next()).value;
      if (currentLeft == null) leftEnded = true;
      if (currentRight == null) rightEnded = true;
      if (!leftEnded && seenTable[currentLeft.id]) {
        leftStack.push(currentLeft);
        rightStack = rightStack.slice(0, seenTable[currentLeft.id]);
        break;
      } else if (!rightEnded && seenTable[currentRight.id]) {
        rightStack.push(currentRight);
        leftStack = leftStack.slice(0, seenTable[currentRight.id]);
        break;
      } else if (!leftEnded && !rightEnded) {
        leftStack.push(currentLeft);
        rightStack.push(currentRight);
        if (currentLeft.id === currentRight.id) break;
        seenTable[currentLeft.id] = leftStack.length;
        seenTable[currentRight.id] = rightStack.length;
      } else {
        if (currentLeft != null) leftStack.push(currentLeft);
        if (currentRight != null) rightStack.push(currentRight);
      }
    }
    return {
      left: leftStack,
      right: rightStack,
    };
  }
  async checkout(targetId: string): Promise<void> {
    // Get diverging path for the action, then undo on left / proceed on right.
    const { left, right } = await this.getDivergingPath(
      this.getHistory(), this.getHistory(targetId));
    for (let i = 0; i < left.length - 1; i += 1) {
      await this.forceUndo(left[i], left[i + 1].id);
    }
    for (let i = right.length - 2; i >= 0; i -= 1) {
      await this.forceRedo(right[i], right[i + 1].id);
    }
    await this.storage.set(right[0].id, right[0]);
    await this.storage.setCurrent(right[0].id);
  }
  async mergeImpl(
    rightIterator: AsyncIterator<Action<T, U>>,
  ): Promise<Action<T, U>> {
    const { left, right } = await this.getDivergingPath(
      this.getHistory(), rightIterator);
    const leftCurrent = left[0];
    const rightCurrent = right[0];
    if (left.length === 1) {
      // Fast forward
      for (let i = right.length - 2; i >= 0; i -= 1) {
        await this.forceRedo(right[i], right[i + 1].id);
      }
      await this.storage.set(rightCurrent.id, rightCurrent);
      await this.storage.setCurrent(rightCurrent.id);
      return rightCurrent;
    }
    if (right.length === 1) {
      // Fast forward
      for (let i = left.length - 2; i >= 0; i -= 1) {
        await this.forceRedo(left[i], left[i + 1].id);
      }
      await this.storage.set(leftCurrent.id, leftCurrent);
      await this.storage.setCurrent(leftCurrent.id);
      return leftCurrent;
    }
    const mutualParent = left[left.length - 1];
    const result =
      await merge(left.slice(0, -1), right.slice(0, -1), this.config);
    const resultAction: Action<T, U> = {
      id: this.generateId(),
      type: 'merge',
      depth: Math.max(leftCurrent.depth, rightCurrent.depth) + 1,
      parents: [
        convertActionsToMergeData(
          leftCurrent.id, result.left, mutualParent.id),
        convertActionsToMergeData(
          rightCurrent.id, result.right, mutualParent.id),
      ],
    };
    await this.forceRedo(resultAction, leftCurrent.id);
    await this.storage.set(resultAction.id, resultAction);
    await this.storage.setCurrent(resultAction.id);
    return resultAction;
  }
  async merge(targetId: string): Promise<Action<T, U>> {
    return this.mergeImpl(this.getHistory(targetId));
  }
  async sync(rpc: SyncRPCSet<T, U>): Promise<Action<T, U>> {
    // Sync protocol is the following:
    // 0. If we know the common parent, we can rewind and put into stack until
    //    it is met.
    // 1. Connect to the remote server, and fetchs latest actions (in bulk).
    //    Then, put them into separate stack.
    // 2. Rewind from this side as well, but the count may vary.
    // 3. If we've seen remote's action from local side, it's finally met -
    //    Perform the merge.
    // 4. After merging, we get the results - we have to push them into the remote
    //    server.
    //    Merging algorithm is supposed to give two sets of actions. One is for
    //    local, and one is for server.
    //    We submit both actions to the server, but instruct them to run which
    //    set to run.
    // 5. Run the actions from the local side.
    //
    // The problem is, to fetch common parent, wehave to continously fetch from
    // the remote point.
    // To handle this, we make sync function to accept networking function set.
    let nextId: string = null;
    const mergeResult = await this.mergeImpl(separateBulk(async () => {
      const output = await rpc.fetch(nextId);
      if (output.length > 0) {
        nextId = output[output.length - 1].id;
      }
      return output;
    }));
    await rpc.submit(mergeResult);
    return mergeResult;
  }
}
