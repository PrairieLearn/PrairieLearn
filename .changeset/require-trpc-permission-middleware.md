---
'@prairielearn/eslint-plugin': minor
'@prairielearn/eslint-config': minor
---

Add `require-trpc-permission-middleware` rule that flags any `t.procedure` chain missing a permission middleware (`requireCoursePermission*`, `requireCourseInstancePermission*`, or `requireAdministrator`). The rule is wired up automatically for files under `**/src/trpc/**/*.ts`.
