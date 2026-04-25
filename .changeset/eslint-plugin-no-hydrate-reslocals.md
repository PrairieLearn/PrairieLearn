---
'@prairielearn/eslint-plugin': minor
---

Add a new rule `@prairielearn/no-hydrate-reslocals` that forbids passing `resLocals` or `locals` (or spreading `res.locals`, `resLocals`, or `locals`) onto a component rendered inside `<Hydrate>` or passed to `hydrateHtml(...)`. All props on a hydrated component are serialized and sent to the client, so these patterns would leak the full server-side locals.
