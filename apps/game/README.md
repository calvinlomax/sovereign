# Future game application

The browser/desktop interface is a later increment. Keep React, map rendering, input, wall-clock scheduling, and persistence adapters in this application; keep game rules in the headless packages.

Start by hosting `GameEngine` in a worker, submitting typed order batches, and rendering snapshots and historical observations. A failed turn returns an error without committing any portion of the batch. Save the engine's JSON envelope to IndexedDB through an application-owned adapter.

No frontend dependencies or placeholder screen are installed in the engine increment.
