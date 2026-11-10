import type { COURSE_DATA_OPERATORS, CourseDataQuery } from '@prairielearn/course-agent-types';
import { escapeIdentifier } from '@prairielearn/postgres';

const OPERATORS = {
  eq: '=',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
} satisfies Record<(typeof COURSE_DATA_OPERATORS)[number], string>;

/**
 * Wraps a dataset's query from datasets.sql to filter, sort, and limit its rows. This is the one
 * place the API assembles SQL in TypeScript, because Postgres cannot take a column name as a
 * parameter. `query` must already be validated against the dataset's request schema, so every
 * column is one of the dataset's own; operators and directions come from fixed lists, and every
 * value and the limit are parameters.
 */
export function selectCourseDatasetRowsQuery(
  datasetQuery: string,
  query: CourseDataQuery,
): { rawSqlQuery: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = { limit: query.limit ?? null };
  const conditions = (query.filters ?? []).map((filter, i) => {
    params[`filter_${i}`] = filter.value;
    return `${escapeIdentifier(filter.column)} ${OPERATORS[filter.op]} $filter_${i}`;
  });
  const ordering = (query.order ?? []).map(
    (term) => `${escapeIdentifier(term.column)} ${term.direction === 'desc' ? 'DESC' : 'ASC'}`,
  );
  const columns = query.select?.length ? query.select.map(escapeIdentifier).join(', ') : '*';
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
