# Code Callers

A "code caller" is an abstraction for invoking some piece of code in a Python subprocess. The code could be either user-provided or provided by PrairieLearn.

## Usage

You can obtain and use a code caller with the `withCodeCaller()` function

```js
const { withCodeCaller } = require('./index.js');

const course = await selectCourse();

await withCodeCaller(course, async (codeCaller) => {
  await codeCaller.call(...);
});
```

## Implementation

A pool of code callers is maintained via the `generic-pool` package. `withCodeCaller()` obtains a code caller from the pool and automatically releases it back to the pool once it's no longer needed.

The individual classes (`CodeCallerContainer` and `CodeCallerNative`) should generally not be used on their own, independent of the pool. The pool does important lifecycle tracking to ensure that code callers are started correctly, restarted after use, and destroyed if they enter a bad state.
