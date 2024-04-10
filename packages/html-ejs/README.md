# `@prairielearn/html-ejs`

Utilities for rendering EJS templates for use with the `@prairielearn/html` package.

If you have an EJS partial that you'd like to use inside of an `html` tagged template literal, you can use the `renderEjs` helper:

```html
<!-- hello.ejs -->
Hello, <%= name %>!
```

```js
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

console.log(
  html`
    <div>Hello, world!</div>
    <div>${renderEjs(__filename, "<%- include('./hello'); %>", { name: 'Anjali' })}</div>
  `.toString(),
);
```
