# `@prairielearn/run`

A small utility for emulating expression-oriented programming, Inspired by https://maxgreenwald.me/blog/do-more-with-run.

## Usage

```ts
import { run } from '@prairielearn/run';

const x = run(() => {
  if (foo()) return 1;
  if (bar()) return 2;
  return 3;
});
```

This is equivalent to the following:

```ts
let x;

if (foo()) {
  x = 1;
} else if (bar()) {
  x = 2;
} else {
  x = 3;
}
```

It's also equivalent to this:

```ts
const x = foo() ? 1 : bar() ? 2 : 3;
```

While the nested ternary is more concise in this example, it's more difficult to read and maintain as the number and complexity of conditions grows.

## Why?

Max Greenwald has a great blog post that explains the rationale for this pattern: https://maxgreenwald.me/blog/do-more-with-run

Why is this one-liner a package? Mostly so the documentation and rationale can be kept in one place.
