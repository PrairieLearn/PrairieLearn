---
'@prairielearn/html': major
---

`renderEjs` function moved to `@prairielearn/html-ejs`

In order to be able to use the `@prairielearn/html` package inside client scripts, EJS functionality was moved to a separate package (`@prairielearn/html-ejs`). The `ejs` package relies on Node-only packages like `fs` and `path`, which renders it unusable in browsers.
