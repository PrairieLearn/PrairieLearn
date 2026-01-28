---
'@prairielearn/signed-token': minor
---

Add `generatePrefixCsrfToken()` and `checkSignedTokenPrefix()` functions for prefix-based CSRF token validation. These functions allow generating a single CSRF token that is valid for all URLs under a given prefix, which is useful for tRPC and similar APIs where multiple endpoints share a common base path.
