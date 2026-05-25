---
'@prairielearn/session': patch
---

Persist regenerated sessions to the store immediately, mirroring `loadSession()`'s behavior for new sessions. This ensures the new session ID is available to other queries within the same request after `req.session.regenerate()`.
