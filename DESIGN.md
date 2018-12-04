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
