# `@prairielearn/public-fetch`

A Fetch-compatible client for requesting untrusted public HTTP(S) URLs without allowing access to
private or otherwise non-public network destinations.

`publicFetch()` validates the initial URL, verifies that every DNS result is a public unicast
address, and pins each connection to a validated address to prevent DNS rebinding. Redirects,
methods, request bodies, abort signals, and streamed `Response` bodies follow the Fetch API.

```ts
import { publicFetch } from '@prairielearn/public-fetch';

const response = await publicFetch('https://example.com/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ event: 'example' }),
  signal: AbortSignal.timeout(10_000),
});

if (!response.ok) {
  await response.body?.cancel();
  throw new Error(`Request failed with status ${response.status}`);
}
```

As with `fetch()`, callers should consume or cancel the response body so the underlying connection
can be released. Callers handling untrusted responses should stream the body and enforce
content-specific size and format limits rather than using buffering helpers without a limit.
