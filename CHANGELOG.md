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
