# avcs

## CRDTs
Let's start with very, very simple case, a counter:

- Increment
- Decrement

We can merge them in any order, however, we must run them only once, since
running them twice or more times, will result in wrong data.

When merging in any order is possible, this is called [CmRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#Operation-based_CRDTs)s,
which doesn't cause any conflict.

In this case, we just have to track what change ID is seen, and apply only
unseen nodes. It becomes really simple!

## It gets harder
But, what if, we can reset the counter to certain number?

- Increment
- Decrement
- Set count

We have no problem if only increment and decrement is present, as they can
run in any order.

```
+-+----+--|--0--++ > Node 2
+-+----+--|+++++++ > Node 1
```

But, once one node issues 'set count', if fast forward is not possible, it
'conflicts', as both node's delta values cannot be preserved.

Therefore, the syncing mechanism can either "fail" by requesting the user to
resolve the conflict, or, overwriting one's value over the others.

For automated systems, failing is undesirable, so they just deterministically
choose what value to preserve. But, for user applications, we can handle this
more elegantly - we can just prompt the user.

CouchDB has choosen hybrid approach - it randomly chooses one of them, but it
stores both revisions, so it can be merged later.

## State vs Action
We can perform replication using state, or history of actions. Using state
has a lot of benefits - only new state has to be seen, so all other state
can be safely discarded. When merging, it can just make diffs and perform
3-way merge.

Using history, however, this is not possible and we have to store all actions,
and we have to derive conflict only using actions. It is really tricky, but,
this has number of benefits - it can save bandwidths, and we don't have to
access data store while replicating - which means we can completely separate
data store logic and replication logic.

But, since the history has to be append-only storage, (like a ledger) it can
generate a lot of useless bandwidth, if the same action happens a lot.

## The magic of rebasing
Like git, action history can be rebased if other nodes haven't seen them yet.
(We can freely squash / rebase commits if other branches are not referencing
them.)

We can benefit from this - we can merge actions into one.

## Action scope
Actions have effect scopes - meaning their effects will have limited range.

Let's say we have 2 numbers to manage - and they still can increment, decrement,
and set count.

For x, y:
- Increment
- Decrement
- Set count

Now, x and y is independent - If 'set count' happens on x, but other
side doesn't edit x, it can just happen without an error.

If both side modifies same value, and one of them contains 'set count',
it still results in crash. But, other value can still be savaged in this
confusion - see this example:

- 1: Set count on x
- 2: Increment on x
- 2: Increment on y
- 1: Decrement on y

x has conflict, but, y is still valid and can be merged without any problem.

But what if these exist?:

- Increment on both x, y
- Decrement on both x, y
- Set count on both x, y

These act on both scope, so the conflict will occur in the same condition.

Note that conflict should always occur when the action is not commutative - so
mainly two action will exist.

### Commutative failure
What if there is multiply and divide? They're commutative, but, they can't
coexist with increment / subtract. I couldn't find any real world tasks like
this, but in order to support this, we should also support commutative group.

## Conflict handling
When a conflict is detected, it can show error, but eventually it has to be
resolved - it needs to provide a facility to detect, and merge errors.

As a replication protocol, merging method shouldn't be only known to 2 nodes -
it MUST be shared between nodes. This can be done by making conflict resolution
algorithm to be deterministic.

However, to support user intervention, this is not possible. Therefore, we must
log confliction merging methods.

Confliction resolution can be asynchronous - it may need to access data store,
ask the user, etc.

The application must be careful to derive the same result between nodes - Since
avcs doesn't know about state, it's the application's duty to keep them intact.

Basically, conflict resolution should follow [Operational Transformation](https://en.wikipedia.org/wiki/Operational_transformation),
since two different states should be merged into one by firing correct actions.

### Conflict merge replication
When conflict is merged between two nodes, its result should be propagated to
other nodes.

Since conflict handler must make two node's data same, for other clients,
they can choose whatever path they want and they should end up in the same
point, thus ignoring conflicted path.

### Conflict eviction
While conflict can happen in multiple scopes, they usually don't have to see
each other.

Let's begin with this scenario.

- A: increment on X
- B: increment on Y
- A: set Y to 0
- B: set X to 3

While X and Y both have conflictions, they're independent - they don't have to
see each other, as they're associative - they don't care if they get merged
in any order.

Therefore, confliction handler can run twice, with domain for X and Y.

But, what if both X and Y gets written?

- A: increment on X
- B: increment on Y
- A: set Y to 0
- B: set X and Y to 3

Since we can't ensure that actions are idempotent, running twice - is not an
option.

Therefore, in this case, avcs should just call confliction handler with
all these actions.

This can be a problem if a user issues an action that applies to the entire
data storage. But since it's impossible to resolve inside here, the application
code is reponsible for such cases.

### Conflict with multiple domains
Merging is pretty simple when it only happens inside single domain, but, some
actions reside in multiple domains, such as:

- a.x, and a.y exists, but it applies in 'a'
- it both affects 'a' and 'b'

First case is properly handled, by merging against entire 'a' domain, but,
second case is really complicated, as it can serverely break the action order
of same domain, thus breaking the order for same client node.

## Action ID
The application, or avcs, must provide a way to dispense unique IDs, and attach
those IDs into every action.

When merging, those IDs should be checked if it was seen before, and not merge
them if we've encountered them before.

This gets pretty dirty when 3 or more nodes are present - it'll be tedious to
check.

A naive method is to store every seen action IDs, and not run them if we've
seen it before.

Prehaps, it should be possible to not do that, if we only have to see 'merge
points'.

## Undo Log
avcs should natively support undo logs; it's required for rollbacks.

## Storing actions
Since the action has to be merged between nodes, actions are not addressable
using single continuous list. (It may be possible before merging with any
other nodes, but in conslusion, it has to be converted into graph model.)

Therefore, action log should be a graph model, which should be navigatiable into
past (reverse direction is not possible).

```
o-o-o-o-o-o-o
  +-o-o-+
```

Since merging requires creating a stack to navigate to the common node, this
shouldn't be a problem.

After replicating, many 'shadow' actions will be left - actions that were
created by merging algorithm. These are used for replication for other nodes,
however, only single branch has to be executed, and if they're present - merging
error shouldn't occur.

### Main branch and other branches
Main branch should be stored, however, other branches must be stored as well.
This can be achieved by using linked lists, as describe above.

#### Node catching up to the main branch
Node catching up to the main branch, i.e. fast-forwarding after merging,
should use one of any branches if available. However, since any branch can be
used, 'first' one recorded in the action can be used.

## Replication protocol
In order to replicate the database, we need to make a protocol.

1. Find the greatest common parent action.
2. Exchange the actions.
3. Run actions in any order if conflict has not occurred.
4. Add amending actions by running application code if conflict has occurred.

Replication itself cannot be performed as master-master model, thus it should
be server-client model. This is required because only one node should determine
the merging method, since it can be non-deterministic.

### Finding the greatest common parent action
Before merging, we must find the range to perform the work - that is, actions
after common parent action.

Server should send first N actions from the latest action, if client has found
mutual action, merging will start from there. If not found, server will send
N more actions, until the mutual action is found.

Since merging order is not guaranteed, if diverging actions has occurred too
much, it would fetch useless actions.

### Exchanging actions
Once the mutual action has found, it should start fetching all the actions from 
there.

After fetching, it should run merge handler by comparing with local action log.

Local action logs are not discarded - special 'merger action' gets written
on the top of it, which should make the action logs even.

Remote action log's side is also written to merge with local action logs.

However, since we need to manage undo data, we actually have to run merging
at the remote side to retrieve undo data.

This is important as it must allow any action, including merging to be rewinded.

### Sharing results
The merging action has been run from each side, and they both have their own
merge data. They share their each undo data, and compose the merge action
from that.

### Limitations
As the new entries cannot be written while merging, this algorithm should be
locked. Or, it must run merge again after merging (local-local merge).

# Wrapping up
All right! All the requirements to build avcs are resolved. From this section,
let's try to build a specification for avcs.

## Action
```ts
type UUID = string;

type Action = {
  id: UUID,
  type: string,
  value: any,
};
```

### Normal actions
- getScopes(action: Action): (string | number)[][]
- getModifyType(action: Action): null | string

```ts
type NormalAction = Action & {
};
```

## Merge
- merge(offendingScope: (string | number)[][], local: Action[], remote: Action[]): Promise<{ local: Action[], remote: Action[] }>
