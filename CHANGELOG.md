Changes
=======
### 0.0.1
First release.

 * Single connections (`Connection` Objects) are stable.
 * Clustering is functional, but not well exercised or particularly robust.
 * NO TESTS FOR YOU! _(Soup Nazi says: "Needs tests!")_

### 0.0.2
Small improvement to `Connection` API: `publish` method now accepts `topic` strings:

    client.publish(*topic*, message, callback)

### 1.0.0
 * Major overhaul of the `Protocol` state machine
   * TCP failure tolerance and reconnection
   * Proper transaction handling for REQ/REP Commands (`IDENTIFY`, `SUB`, `PUB`, `CLS`)
   * Error response handling
 * Separation of the `Connection` controller from `NSQClient`. An instance of
   `NSQClient` now stores connection data for a single `nsqd` endpoint and
   provides methods to create/access a dedicated publisher `Connection` and to
   create subscriber `Connection`s.
 * `Subscriber` state-machine
   * Wrap and manage the ready-state of subscriber `Connection`
   * Handle re-subscription on re-connection of the underlying `Protocol`
   * Handle clean un-subscription on close of the underlying `Connection`
 * Use [int64-native](https://npmjs.org/package/int64-native) to handle message timestamps
