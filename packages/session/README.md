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

If you want to rotate to a new session cookie name, you can provide an array of cookie names to `createSessionMiddleware`.

```ts
createSessionMiddleware({
  // ...
  cookie: {
    name: ['session', 'legacy_session', 'ancient_session'],
  },
});
```

If a request is received with a `legacy_session` or an `ancient_session` cookie, the session will be loaded from the store and then persisted as a new cookie named `session`. For all other requests, the session will be loaded from and persisted to the `session` cookie.

### Controlling when cookies are set

You can pass a `canSetCookie` function to `createSessionMiddleware` to provide control over when session cookies will be returned to the client.

```ts
createSessionMiddleware({
  canSetCookie: (req) => {
    return req.hostname === 'us.prairielearn.com';
  },
});
```

This can be useful to enforce that a session cookie is only ever set from a root domain and not subdomains.

- If a request is received that does not have a valid session cookie, a temporary session will be created at `req.session`, but it won't be persisted since the client won't know about the session ID.
- If a request is received that already has a valid session cookie, modifications to the session will be persisted, but the cookie itself won't be updated.
