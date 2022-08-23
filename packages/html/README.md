# `@prairielearn/html`

Utilities for easily rendering HTML from within JavaScript.

## Usage

The `html` tagged template literal can be used to render HTML while ensuring that any interpolated values are properly escaped.

By convention, HTML templates are located in `*.html.tmpl.js` files.

```js
// Hello.html.tmpl.js
const { hmtl } = require('@prairielearn/html');

module.exports.Hello = function Hello({ name }) {
  return html`<div>Hello, ${name}!</div>`;
};
```

This can then be used to render a string:

```js
const { Hello } = require('./Hello');

console.log(Hello({ name: 'Anjali' }).toString());
// Prints "<div>Hello, Anjali!</div>"
```

### Using escaped HTML

If you want to pre-escape some HTML, you can wrap it in `escapeHtml` to avoid escaping it twice. This is useful if you want to inline some HTML into an attribute, for instance with a Bootstrap popover.

```js
const { html, escapeHtml } = require('@prairielearn/html');

console.log(html`
  <button data-bs-toggle="popover" data-bs-content="${escapeHtml(html`<div>Content here</div>`)}">
    Open popover
  </button>
`);
```

## Why not EJS?

PrairieLearn used (and still uses) EJS to render most views. However, using a tagged template literal and pure JavaScript to render views has a number of advantages:

- Prettier will automatically format the content of any `html` tagged template literal; EJS does not have any automatic formatters.
- Authoring views in pure JavaScript allows for easier and more explicit composition of components.
- It's possible to use ESLint and TypeScript to type-check JavaScript views; EJS does not offer support for either.

If you want to use existing EJS partials inside of an `html` tagged template literal, check out the `@prairielearn/html-ejs` package. EJS-related functionality is deliberately located in a separate package so that `@prairielearn/html` can be used in the browser, since the `ejs` package makes use of Node-only features.
