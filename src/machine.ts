import randomstring from 'randomstring';
import { Action, MachineConfig, SyncRPCSet } from './type';
import { Storage } from './storage';
import { separateBulk } from './util/iterator';

type ActionDomain<T, U> = {
  children: { [key: string]: ActionDomain<T, U> },
  left: { touched: boolean, modifyType: number | null | false },
  right: { touched: boolean, modifyType: number | null | false },
};

const INVERTED_TYPES = {
  action: 'undo' as 'undo',
  undo: 'action' as 'action',
  merge: 'merge' as 'merge',
};

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
  async run(payload: T): Promise<string> {
    // Run and record the action into the system.
    const currentAction = await this.storage.getCurrent();
    const undoValue = await this.config.run(payload);
    const newAction: Action<T, U> = {
      payload,
      undoValue,
      id: this.generateId(),
      type: 'action',
      shadow: false,
      parents: [currentAction.id],
    };
    await this.storage.set(newAction.id, newAction);
    await this.storage.setCurrent(newAction.id);
    return newAction.id;
  }
  async undo(action: Action<T, U>): Promise<string> {
    // Undo and record it
    const currentAction = await this.storage.getCurrent();
    // TODO If the action domain has been tampered with before, we must run
    // merge conflict handler here.
    const undoValue = await this.forceUndo(action);
    const newAction: Action<T, U> = {
      undoValue,
      payload: action.payload,
      id: this.generateId(),
      type: INVERTED_TYPES[action.type],
      shadow: false,
      parents: [currentAction.id],
    };
    await this.storage.set(newAction.id, newAction);
    await this.storage.setCurrent(newAction.id);
    return newAction.id;
  }
  async redo(action: Action<T, U>): Promise<string> {
    // Redo and record it
    const currentAction = await this.storage.getCurrent();
    const undoValue = await this.forceRedo(action);
    const newAction: Action<T, U> = {
      undoValue,
      payload: action.payload,
      id: this.generateId(),
      type: INVERTED_TYPES[action.type],
      shadow: false,
      parents: [currentAction.id],
    };
    await this.storage.set(newAction.id, newAction);
    await this.storage.setCurrent(newAction.id);
    return newAction.id;
  }
  async undoLast(): Promise<void> {
    const action = await this.storage.getCurrent();
    // TODO Transactions
    await this.forceUndo(action);
    await this.storage.setCurrent(action.parents[0]);
  }
  async forceUndo(action: Action<T, U>): Promise<U | null> {
    switch (action.type) {
      case 'action':
        await this.config.undo(action.payload, action.undoValue);
        return null;
      case 'undo':
        return this.config.run(action.payload);
      case 'merge':
        // Do nothing; we can't do anything about this.
        return;
    }
  }
  async forceRedo(action: Action<T, U>): Promise<U | null> {
    switch (action.type) {
      case 'action':
        return this.config.run(action.payload);
      case 'undo':
        await this.config.undo(action.payload, action.undoValue);
        return null;
      case 'merge':
        // Do nothing; we can't do anything about this.
        return;
    }
  }
  async * getHistory(startId?: string): AsyncIterator<Action<T, U>> {
    let action: Action<T, U>;
    if (startId != null) {
      action = await this.storage.get(startId);
    } else {
      action = await this.storage.getCurrent();
    }
    while (action != null) {
      yield action;
      const parentId = action.parents[0];
      if (parentId == null) {
        break;
      } else {
        action = await this.storage.get(parentId);
      }
    }
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
  async jumpTo(targetId: string): Promise<void> {
    // Get diverging path for the action, then undo on left / proceed on right.
    const { left, right } = await this.getDivergingPath(
      this.getHistory(), this.getHistory(targetId));
    for (let i = 0; i < left.length; i += 1) {
      await this.forceUndo(left[i]);
    }
    for (let i = right.length - 1; i >= 0; i -= 1) {
      await this.forceRedo(right[i]);
    }
  }
  async sync(rpc: SyncRPCSet<T, U>): Promise<void> {
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
    const { left, right } = await this.getDivergingPath(
      this.getHistory(),
      separateBulk(async () => {
        const output = await rpc.fetch(nextId);
        if (output.length > 0) {
          nextId = output[output.length - 1].id;
        }
        return output;
      }),
    );
    // We have to check scopes and modify types.
    // When the scope conflicts, check modify type - if modify type is
    // different, or is null, it's a conflict.
    // However, different modify type from same node is tolerable.
    const domains: { [key: string]: ActionDomain<T, U> } = {};
    left.forEach((action) => {
      const scopes = this.config.getActionScopes(action);
      scopes.forEach((scope) => {
        scope.keys.reduce(
          (domain, key, i) => {
            let child = domain[key];
            if (child == null) {
              child = domain[key] = {
                children: {},
                left: { touched: false, modifyType: undefined },
                right: { touched: false, modifyType: undefined },
              };
            }
            child.left.touched = true;
            if (i === scope.keys.length - 1) {
              if (child.left.modifyType === undefined) {
                // Claim the modify type
                child.left.modifyType = scope.modifyType;
              } else if (child.left.modifyType !== scope.modifyType) {
                child.left.modifyType = false;
              }
            }
            return child.children;
          },
          domains);
      });
    });
    right.forEach((action) => {
      const scopes = this.config.getActionScopes(action);
      scopes.forEach((scope) => {
        scope.keys.reduce(
          (domain, key, i) => {
            let child = domain[key];
            if (child == null) {
              child = domain[key] = {
                children: {},
                left: { touched: false, modifyType: undefined },
                right: { touched: false, modifyType: undefined },
              };
            }
            child.right.touched = true;
            if (i === scope.keys.length - 1) {
              if (child.right.modifyType === undefined) {
                // Claim the modify type
                child.right.modifyType = scope.modifyType;
              } else if (child.left.modifyType !== scope.modifyType) {
                child.right.modifyType = false;
              }
            }
            return child.children;
          },
          domains);
      });
    });
    // Traverse down the tree, and detect any confliction.
    // The confliction must be small as possible - it's okay to issue more than
    // two merge conflicts, as we can ensure that their orders don't need to be
    // preserved.
    // However, if a single action is involved in two or more conflicts, they
    // MUST be treated as whole, otherwise it'll be executed multiple times.
    //
    // To implement this, we first generate flag list, then check for an action
    // which multiple flags has been set. Then, merge these two conflicts.
    //
    // After doing that, we add 'amending' actions on each side, generated by
    // the machine config. These actions must be not merged - they're simply
    // a marker for resolving conflicts.
  }
}
