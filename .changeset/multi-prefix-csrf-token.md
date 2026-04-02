---
'@prairielearn/signed-token': minor
---

Support multiple URL prefixes in a single CSRF token. `generatePrefixCsrfToken` now accepts `{ urls: string[] }` in addition to `{ url: string }`, and `checkSignedTokenPrefix` validates against any matching prefix.
