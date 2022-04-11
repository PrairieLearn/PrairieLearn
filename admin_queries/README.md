# Administrator queries

Each query must have two files:

- A JSON file in the [`adminQuery` JSON Schema](../schemas/schemas/adminQuery.json).
- A SQL file with a query that returns a table, and potentially also performs an INSERT, UPDATE, or other action.

To render columns as links, return column pairs like:

- `course_id`/`course` - If these are both present, the `course_id` is not displayed but is used to link the `course`. The `course` column should be `pl_courses.short_name AS course`.
- `course_instance_id`/`course_instance` - The `course_instance` should be `course_instances.short_name AS course_instance`.
- `assessment_id`/`assessment` - The `assessment` should be `aset.abbreviation || a.number || ': ' || a.title AS assessment` or just `aset.abbreviation || a.number AS assessment`.

To change the sort order for column with name `COL`, return another column with name `_sortval_COL`.

Dates and intervals should be rendered with:

- `format_date_full_compact(my_date, config_select('display_timezone')) AS my_date` - This will automatically sort correctly.
- `format_interval(my_interval) AS my_interval` - This should be accompanied by `DATE_PART('epoch', my_interval) AS _sortval_my_interval` for sorting.
