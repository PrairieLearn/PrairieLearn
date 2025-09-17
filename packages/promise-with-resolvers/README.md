# `@prairielearn/promise-with-resolvers`

A tiny utility for creating Promises with exposed `resolve` and `reject` methods, similar to [`Promise.withResolvers()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers).

Once `Promise.withResolvers()` is widely supported in browsers, users of this package should switch to it.

## Usage

```ts
import { withResolvers } from '@prairielearn/promise-with-resolvers';

const { promise, resolve, reject } = withResolvers<number>();

setTimeout(() => resolve(42), 100);

promise.then((value) => {
  console.log(value); // 42
});
```
