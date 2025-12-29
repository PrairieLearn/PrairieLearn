# Administrator queries

Each query must have a JS or TS file that exports the following items:

- a constant named `specs` of type `AdministratorQuerySpecs`.
- a default function that receives an object corresponding to query parameters, performs the necessary actions, and returns the resulting data as an object of type `AdministratorQueryResults`.

For example:

```ts
import type { AdministratorQuerySpecs, AdministratorQueryResult } from './util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'A brief description of the query',
  // ...
};

export default async function (params: { /* types */ }): Promise<AdministratorQueryResult> {
  // Perform some actions, including potentially running SQL queries
  // Return an array of column names and an array of row objects
  return { columns, rows };
}
```

Queries may also refer to a SQL file with the same name but extension `.sql`, with one or more queries used in the query.

To render columns as links, return column pairs like:

- `course_id`/`course` - If these are both present, the `course_id` is not displayed but is used to link the `course`. The `course` column should be `courses.short_name AS course`.
- `course_instance_id`/`course_instance` - The `course_instance` should be `course_instances.short_name AS course_instance`.
- `assessment_id`/`assessment` - The `assessment` should be `aset.abbreviation || a.number || ': ' || a.title AS assessment` or just `aset.abbreviation || a.number AS assessment`.

To change the sort order for column with name `COL`, return another column with name `_sortval_COL`. The `_sortval_COL` column does not need to be included in `columns`, though it will be ignored if it is included.

Dates and intervals should be rendered with:

- `format_date_full_compact(my_date, 'UTC') AS my_date` - This will automatically sort correctly.
- `format_interval(my_interval) AS my_interval` - This should be accompanied by `DATE_PART('epoch', my_interval) AS _sortval_my_interval` for sorting.
