# `@prairielearn/async-local-event-buffer`

Allows for capturing events during an asynchronous operation _without_ the need to manually propagate anything through nested callback and Promise chains. This is achieved with Node's [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage) primitive. An event consists of a timestamp, a message, and optional arbitrary data.

## Usage

```ts
import { eventBuffer, runWithEventBuffer } from '@prairielearn/async-local-event-buffer';

await runWithEventBuffer(async () => {
  // Imagine any chain of asynchronous operations here, including calls to
  // complex functions
  await new Promise((resolve) => {
    eventBuffer.push('message', { count: 1 });
  });

  console.log(eventBuffer.flush());
});
```

When `eventBuffer` is accessed outside of `runWithEventBuffer`, it will silently no-op and discard any events.
