---
'@prairielearn/postgres': minor
---

Add a `signal` option to `queryCursor()`. When the signal aborts, a batch being read is canceled on the server and iteration throws the signal's reason.
