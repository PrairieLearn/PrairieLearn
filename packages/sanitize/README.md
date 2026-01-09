# `@prairielearn/sanitize`

A collection of functions for sanitizing and escaping various values.

## Usage

```ts
import {
  sanitizeObject,
  escapeRegExp,
  truncate,
  recursivelyTruncateStrings,
} from '@prairielearn/sanitize';

sanitizeObject({
  value: 'null \u0000 byte',
});

escapeRegExp('foo*(bar)');

truncate('testing testing', 7);

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
