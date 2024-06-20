# `@prairielearn/flash`

Adds support for flash messages to Express applications.

## Usage

`req.session` must exist; [`express-session`](https://www.npmjs.com/package/express-session) is the most common way to use sessions in Express.

```ts
import express from 'express';
import session from 'express-session';
import { flashMiddleware } from '@prairielearn/flash';

const app = express();

app.use(
  session({
    // See https://www.npmjs.com/package/express-session for more information
    // about configuring the session middleware.
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
  }),
);
app.use(flashMiddleware());
```

Now, you can use the `flash()` function exported by `@prairielearn/flash` to read/write flash messages.

```ts
import { flash } from '@prairielearn/flash';

app.get('/set-flash', (req, res) => {
  flash('notice', 'Your preferences have been updated.');
  flash('success', 'Course created successfully.');
  flash('warning', 'Syncing completed with 5 warnings.');
  flash('error', html`Group must have <em>fewer than 10 members</em>.`);

  res.redirect('/display-flash');
});

app.get('/display-flash', (req, res) => {
  const messages = flash();
  res.json(messages);
});
```

The `flash()` function has three behaviors:

- `flash(type: string, message: string | HtmlSafeString)`: Set a message with the given type.
- `flash(type: string): FlashMessage[]`: Get all messages with the given type.
- `flash(types: string[]): FlashMessage[]`: Get all messages with any of the given types.
- `flash(): FlashMessage[]`: Get all messages.

Once a message is read, it is immediately removed from the persisted list of messages. A message is _only_ removed once it is read; it will be persisted indefinitely if it iw not.
