---
'@prairielearn/react': patch
---

Fix React hydration mismatch with `useId()` by rendering hydrated components in an isolated React tree. This ensures hooks like `useId()` generate consistent values between server and client by placing components at the "root" position on both sides.
