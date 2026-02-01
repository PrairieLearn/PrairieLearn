---
'@prairielearn/logger': minor
'@prairielearn/migrations': patch
---

Add `withoutLogging` utility to `@prairielearn/logger` for temporarily silencing logger output during test execution.

Remove `logError` parameter from batched migration runner API - use `withoutLogging()` wrapper instead.
