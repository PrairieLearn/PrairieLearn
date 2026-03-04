---
'@prairielearn/postgres': major
---

Require `z.object(...)` schemas in query functions (`queryRow`, `queryRows`, `queryOptionalRow`, `callRow`, `callRows`, `callOptionalRow`, `queryCursor`). Branded object schemas (via `.brand()`) are also accepted. Remove implicit single-column flattening behavior where single-column query results were automatically unwrapped. Add explicit scalar query functions (`queryScalar`, `queryScalars`, `queryOptionalScalar`, `callScalar`, `callScalars`, `callOptionalScalar`) for single-column queries that accept any Zod schema and validate the column value directly.
