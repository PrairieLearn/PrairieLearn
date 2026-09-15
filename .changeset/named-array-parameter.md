---
'@prairielearn/postgres': major
---

Bind named array values as a single parameter, matching positional parameters and avoiding PostgreSQL's parameter count limit for large arrays.

Previously, named arrays expanded into `ARRAY[$1,$2,...]`. Queries relying on the constructor's type inference must now specify an array type, for example `unnest($ids::bigint[])` instead of `unnest($ids)`, or `SELECT $names::text[]` instead of `SELECT $names`. When converting an array to text, cast to the array type first: `$names::text[]::text`.

Named arrays now use node-postgres array serialization, just like positional arrays. For JSON values, pass `JSON.stringify(value)` and use the appropriate `::jsonb` cast. Positional parameter behavior is unchanged.
