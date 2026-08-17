# `@prairielearn/ssrf-protection`

Utilities for making HTTP GET requests to untrusted URLs without allowing access to private or
otherwise non-public network destinations.

`requestFromPublicUrl()` validates every request and redirect, verifies that every DNS result is a
public unicast address, and pins the connection to a validated address to prevent DNS rebinding. It
also preserves the original host for the HTTP `Host` header and TLS Server Name Indication (SNI),
and strips credential-bearing headers from cross-origin redirects.

```ts
import { requestFromPublicUrl } from '@prairielearn/ssrf-protection';

const response = await requestFromPublicUrl(new URL('https://example.com/file'), {
  headers: { Accept: 'application/json' },
  maxRedirects: 3,
  timeoutMs: 10_000,
});
```

The response body is exposed as a stream so callers can enforce content-specific size and format
limits. Requests use a single timeout across DNS resolution, redirects, connection setup, and body
streaming.
