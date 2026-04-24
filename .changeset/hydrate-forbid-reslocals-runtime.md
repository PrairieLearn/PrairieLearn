---
'@prairielearn/react': minor
---

`<Hydrate>` now throws at render time if the child component is given a `resLocals` or `locals` prop. All props on a hydrated component are serialized and sent to the client, so passing `res.locals` would leak the entire server-side locals object. Extract the specific fields you need (e.g. via `extractPageContext`) and pass them as individual props instead.
