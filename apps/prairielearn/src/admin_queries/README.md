# Administrator queries

Each query must have the following files:

- A JSON file in the [`adminQuery` JSON Schema](../schemas/schemas/adminQuery.json).
- Either:
  - A JS or TS file with a default function that performs the necessary actions and returns the resulting data.
  - A SQL file with a query that returns a table, and potentially also performs an INSERT, UPDATE, or other action.

If a JS or TS file is provided, it must export a function that returns an object of type AdministratorQueryResult. For example:

```ts
import type { AdministratorQueryResult } from './types/index.types.js';

export default async function (params: Record<string, any>): Promise<AdministratorQueryResult> {
  // Perform some actions, including potentially running queries
  // Return a array of column names and an array of row objects
  return { columns, rows };
}
```

To render columns as links, return column pairs like:

- `course_id`/`course` - If these are both present, the `course_id` is not displayed but is used to link the `course`. The `course` column should be `pl_courses.short_name AS course`.
- `course_instance_id`/`course_instance` - The `course_instance` should be `course_instances.short_name AS course_instance`.
- `assessment_id`/`assessment` - The `assessment` should be `aset.abbreviation || a.number || ': ' || a.title AS assessment` or just `aset.abbreviation || a.number AS assessment`.

To change the sort order for column with name `COL`, return another column with name `_sortval_COL`. The `_sortval_COL` column does not need to be included in `columns`, though it will be ignored if it is included.

Dates and intervals should be rendered with:

- `format_date_full_compact(my_date, 'UTC') AS my_date` - This will automatically sort correctly.
- `format_interval(my_interval) AS my_interval` - This should be accompanied by `DATE_PART('epoch', my_interval) AS _sortval_my_interval` for sorting.
