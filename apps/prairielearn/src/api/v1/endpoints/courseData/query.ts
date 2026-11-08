import { HttpStatusError } from '@prairielearn/error';
import { escapeIdentifier } from '@prairielearn/postgres';

const OPERATORS = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
} as const;

const RESERVED = new Set(['select', 'order', 'limit']);

/**
 * Builds a query over one table's block from PostgREST-style query parameters, such as
 * `select=id,score&score=lt.0.5&order=submitted_at.desc&limit=10`. Column names are checked
 * against the table's columns before they are quoted into SQL; values are always parameters,
 * which Postgres converts to each column's type.
 */
export function buildCourseDataQuery({
  block,
  columns,
  search,
}: {
  block: string;
  columns: string[];
  search: URLSearchParams;
}): { sql: string; params: Record<string, unknown> } {
  const known = new Set(columns);
  const column = (name: string) => {
    if (!known.has(name)) {
      throw new HttpStatusError(400, `Unknown column "${name}". Columns: ${columns.join(', ')}.`);
    }
    return escapeIdentifier(name);
  };

  const select = search.get('select');
  const selected = select ? select.split(',').map((name) => column(name.trim())) : ['*'];

  const params: Record<string, unknown> = {};
  const conditions: string[] = [];
  for (const [name, expression] of search) {
    if (RESERVED.has(name)) continue;
    const quoted = column(name);
    const dot = expression.indexOf('.');
    const operator = dot === -1 ? '' : expression.slice(0, dot);
    const value = expression.slice(dot + 1);
    const param = `filter_${conditions.length}`;
    if (operator === 'in') {
      if (!value.startsWith('(') || !value.endsWith(')')) {
        throw new HttpStatusError(400, `Expected ${name}=in.(a,b,…).`);
      }
      params[param] = value.slice(1, -1).split(',');
      conditions.push(`${quoted} = ANY ($${param})`);
    } else if (operator === 'is') {
      const tests = { null: 'IS NULL', true: 'IS TRUE', false: 'IS FALSE' } as const;
      if (!Object.hasOwn(tests, value)) {
        throw new HttpStatusError(400, `Expected ${name}=is.null, is.true, or is.false.`);
      }
      conditions.push(`${quoted} ${tests[value as keyof typeof tests]}`);
    } else if (Object.hasOwn(OPERATORS, operator)) {
      params[param] = value;
      conditions.push(`${quoted} ${OPERATORS[operator as keyof typeof OPERATORS]} $${param}`);
    } else {
      throw new HttpStatusError(
        400,
        `Unknown operator in ${name}=${expression}. Use ${[...Object.keys(OPERATORS), 'in', 'is'].join(', ')}, as in ${name}=eq.value.`,
      );
    }
  }

  const order = search.get('order');
  const ordering = order
    ? order.split(',').map((term) => {
        const [name, direction = 'asc'] = term.trim().split('.');
        if (direction !== 'asc' && direction !== 'desc') {
          throw new HttpStatusError(400, `Expected order=${name}.asc or order=${name}.desc.`);
        }
        return `${column(name)} ${direction.toUpperCase()}`;
      })
    : [];

  const limit = search.get('limit');
  if (limit !== null && !/^\d+$/.test(limit)) {
    throw new HttpStatusError(400, 'Expected limit to be a non-negative integer.');
  }

  return {
    sql: [
      `SELECT ${selected.join(', ')} FROM (${block.trim().replace(/;$/, '')}) AS t`,
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      ordering.length > 0 ? `ORDER BY ${ordering.join(', ')}` : '',
      limit !== null ? `LIMIT ${Number(limit)}` : '',
    ].join('\n'),
    params,
  };
}
