---
'@prairielearn/migrations': major
---

SQL migrations are now run inside a transaction by default

If you need to disable this behavior, you can add an annotation comment to the top of the migration file:

```sql
-- prairielearn:migrations NO TRANSACTION
CREATE INDEX CONCURRENTLY ...
```

Note that migrations implemented as JavaScript are not run in transactions by default. Transactions should be manually used as appropriate.
