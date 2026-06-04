---
'@prairielearn/config': major
'@prairielearn/postgres': major
'@prairielearn/zod': major
---

Upgrade to Zod 4. Zod is part of these packages' public API surface (exported schemas and schema-generic functions such as `ConfigLoader` and the `query*` helpers), so consumers must also upgrade to Zod 4. Additionally, `@prairielearn/postgres` no longer exports the `AnyRowSchema` type alias; use `z.ZodType` instead.
