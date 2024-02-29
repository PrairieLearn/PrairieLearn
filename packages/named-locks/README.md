# `@prairielearn/named-locks`

Uses Postgres row-level locks to grant exclusive access to resources.

## Usage

You must first call `init` with Postgres connection details and an idle error handler:

```ts
import { init } from '@prairielearn/named-locks';

await init(
  {
    user: 'postgres',
    // ... other Postgres config
  },
  (err) => {
    throw err;
  },
);
```

You can then obtain a lock and do work while it is held. The lock will be automatically released once the provided function either resolves or rejects.

```ts
import { doWithLock } from '@prairielearn/named-locks';

await doWithLock('name', {}, async () => {
  console.log('Doing some work');
});
```

Optionally, you may configure the lock to automatically "renew" itself by periodically making no-op queries in the background. This is useful for operations that may take longer than the configured Postgres idle session timeout.

```ts
import { doWithLock } from '@prairielearn/named-locks';

await doWithLock(
  'name',
  {
    autoRenew: true,
  },
  async () => {
    console.log('Doing some work');
  },
);
```
