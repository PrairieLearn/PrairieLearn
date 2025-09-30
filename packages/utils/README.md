# `@prairielearn/utils`

Various shared utilities.

## Usage

### `withResolvers()`

A tiny utility for creating Promises with exposed `resolve` and `reject` methods, similar to [`Promise.withResolvers()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers).

Once `Promise.withResolvers()` is widely supported in browsers, users of this package should switch to it.

```ts
import { withResolvers } from '@prairielearn/utils';

const { promise, resolve, reject } = withResolvers<number>();

setTimeout(() => resolve(42), 100);

promise.then((value) => {
  console.log(value); // 42
});
```
