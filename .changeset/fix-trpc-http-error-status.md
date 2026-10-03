---
'@prairielearn/trpc': minor
---

Preserve HTTP statuses on errors wrapped by tRPC in `appErrorFormatter`, reusing the Express error-response status mapping. Export `getTrpcErrorStatus` so application logging can use the same classification before formatting.
