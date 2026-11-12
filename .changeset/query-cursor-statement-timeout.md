---
'@prairielearn/postgres': minor
---

Add a `statementTimeoutMs` option to `queryCursor()` that cancels a slow statement and resets the timeout before the connection returns to the pool.
