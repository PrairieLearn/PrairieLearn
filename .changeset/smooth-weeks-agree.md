---
"@prairielearn/eslint-plugin": minor
---

Add `no-current-target-in-callback` lint rule to detect when `event.currentTarget` is accessed inside a nested callback within a React event handler. This pattern is problematic because React may execute callbacks asynchronously, at which point `currentTarget` may already be nullified.
