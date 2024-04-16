# `@prairielearn/session`

The implementation borrows heavily from prior art such as [`express-session`](https://github.com/expressjs/session) and [`fastify-session`](https://github.com/fastify/session). However, the semantics and functionality have been changed to better suit PrairieLearn's needs. Specifically:

- We need to have more precise control over when the session is written back to the session store. `express-session` will try to write the session on every request, which produces an undesirable amount of load on the database.
- We need to have more precise control over when new/updated cookies are sent back to the client. In the near future, we'll need to avoid writing these cookies when requests are served from subdomains.

## Usage

```ts
import express from 'express';
import { createSessionMiddleware, MemoryStore } from '@prairielearn/session';

const app = express();

app.use(
  createSessionMiddleware({
    store: new MemoryStore(),
    secret: 'top_secret',
  }),
);
```

### Rotate session cookies

It can be useful to rotate to a new session cookie name. For instance, this can be used to provide an explicit subdomain when none was set before.

To do this, you can use a combination of `cookie.writeNames` and `cookie.writeOverrides`:

```ts
createSessionMiddleware({
  // ...
  cookie: {
    name: 'legacy_session',
    writeNames: ['legacy_session', 'session'],
    writeOverrides: [{ domain: undefined }, { domain: '.example.com' }],
  },
});
```

In this example, the session will be loaded from and persisted to the `legacy_session` cookie. However, when the session is persisted, it will also be written to a new cookie named `session`. The `domain` attribute of the `legacy_session` cookie will not be set, while the `domain` attribute of the `session` cookie will be set to `.example.com`.

After this code has been running in production for a while, it will be safe to switch to reading from and writing to the new `session` cookie exclusively:

```ts
createSessionMiddleware({
  cookie: {
    name: 'session',
    domain: '.example.com',
  },
});
```
