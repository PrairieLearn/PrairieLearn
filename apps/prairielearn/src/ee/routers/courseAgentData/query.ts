import type { COURSE_DATA_COMPARISONS, CourseDataQuery } from '@prairielearn/course-agent-types';
import { escapeIdentifier } from '@prairielearn/postgres';

const OPERATORS = {
  eq: '=',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
} satisfies Record<(typeof COURSE_DATA_COMPARISONS)[number], string>;

/**
 * Wraps a dataset's query from datasets.sql to select, filter, sort, and limit its rows. Postgres
 * flattens the wrapped query, so it reads only the selected columns, which matters for large JSON
 * ones. This is the one place the course data router assembles SQL in TypeScript, because Postgres
 * cannot take a column name as a parameter. `query` must already be validated against the
 * dataset's request schema, so every column is one of the dataset's own; operators and directions
 * come from fixed lists, and every value, `in` list, and the limit are parameters.
 */
export function selectCourseDatasetRowsQuery(
  datasetQuery: string,
  query: CourseDataQuery,
): { rawSqlQuery: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = { limit: query.limit ?? null };
  const conditions = (query.filters ?? []).map((filter, i) => {
    params[`filter_${i}`] = filter.value;
    const column = escapeIdentifier(filter.column);
    // Postgres reads an `in` list as an array of the column's type, so it needs no casts.
    if (filter.op === 'in') return `${column} = ANY($filter_${i})`;
    return `${column} ${OPERATORS[filter.op]} $filter_${i}`;
  });
  const ordering = (query.order ?? []).map(
    (term) => `${escapeIdentifier(term.column)} ${term.direction === 'desc' ? 'DESC' : 'ASC'}`,
  );
  const columns = query.select.map(escapeIdentifier).join(', ');
  return {
    rawSqlQuery: [
      `SELECT ${columns} FROM (${datasetQuery.trim().replace(/;$/, '')}) AS t`,
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      ordering.length > 0 ? `ORDER BY ${ordering.join(', ')}` : '',
      'LIMIT $limit',
    ].join('\n'),
    params,
  };
}
