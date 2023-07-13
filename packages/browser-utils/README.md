# `@prairielearn/browser-utils`

Helpful utilities for writing client-side vanilla JavaScript.

## Usage

### `onDocumentReady`

Runs the provided function once the document is ready.

```ts
import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  console.log('Document is ready!');
});
```

To be precise, if `document.readyState` is `interactive` or `complete`, the function is run immediately. Otherwise, it will be run once the `DOMContentLoaded` event is fired.

### `parseHTML` and `parseHTMLElement`

These functions return a `DocumentFragment` and `Element` from the provided HTML, respectively. The HTML can be an `HtmlSafeString` from `@prairielearn/html` or a plain string.

```ts
import { parseHTML, parseHTMLElement } from '@prairielearn/browser-utils';

const elements = parseHTML(
  document,
  html`
    <div>Hello, world</div>
    <div>Goodbye, world</div>
  `,
);
const div = parseHTMLElement(document, html`<div>Hello, world</div>`);
```

### `EncodedData` and `decodeData`

These functions can be used to encode some state on the server and retrieve it on the client. For example, one could encode a list of courses on the server:

```ts
import { EncodedData } from '@prairielearn/browser-utils';

app.get('/', (req, res) => {
  const courses = ['CS 101', 'PHYS 512'];
  res.send(`<html><body>${EncodedData(courses, 'courses-data')}</body></html>`);
});
```

On the client, they can be retrieved with `decodeData`:

```ts
import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const data = decodeData<string[]>('courses-data');
  console.log(data);
});
```

### `templateFromAttributes`

This function simplifies the common pattern of taking attributes from one HTML element and using them as the content of other HTML elements. This is often done with modals that need to display information about a specific entity.

Consider the following simplified markup:

```html
<button class="js-delete-course" data-course-name="CS 123">Delete course</button>

<div class="modal" id="deleteCourseModal">
  <p>Are you sure you want to delete course <strong class="js-course-name"></strong>?</p>
  <button type="button">Cancel</button>
  <button type="button">Delete <span class="js-course-name"></span></button>
</div>
```

The following JavaScript will "template" the value from `data-course-name` on the button into the elements with the `.js-course-name` in the modal.

```ts
import { templateFromAttributes } from '@prairielearn/browser-utils';

const modal = document.querySelector('#deleteCourseModal');
document.querySelectorAll('.js-delete-course').forEach((el) => {
  el.addEventListener('click', (e) => {
    const button = e.target;
    templateFromAttributes(e.currentTarget, modal, {
      'data-course-name': '.js-course-name',
    });
  });
});
```

## Development

Unlike most other `@prairielearn` packages, this one is built with [`tsup`](https://tsup.egoist.dev/), which is used to generate both CJS and ESM output. The latter is important for ensuring that tree-shaking works correctly when building client bundles, which is important for minimizing bundle sizes.
