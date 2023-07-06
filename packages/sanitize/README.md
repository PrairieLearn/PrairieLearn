# `@prairielearn/sanitize`

A collection of functions for sanitizing and escaping various values.

## Usage

```ts
import { sanitizeObject, escapeRegExp, recursivelyTruncateStrings } from '@prairielearn/sanitize';

sanitizeObject({
  value: 'null \u0000 byte',
});

escapeRegExp('foo*(bar)');

recursivelyTruncateStrings(
  {
    foo: {
      bar: {
        baz: 'biz'.repeat(10000),
      },
    },
  },
  100,
);
```
