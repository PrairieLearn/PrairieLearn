---
'@prairielearn/eslint-plugin': patch
---

Expand the `no-current-target-in-callback` rule to also flag `event.currentTarget` accesses after `await` in React event handlers.
