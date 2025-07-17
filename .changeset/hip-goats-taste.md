---
'@prairielearn/postgres': major
---

Remove deprecated validated query/call functions.

Users should replace `queryValidated*` (except for `queryValidatedCursor`) and `callValidated*` with the equivalent `query*` and `call*`, respectively. For queries returning multiple columns, these calls would be equivalent. For queries returning a single column, the schema needs to be updated to the column schema.
