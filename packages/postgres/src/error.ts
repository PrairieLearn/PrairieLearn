export function formatQueryWithErrorPosition(query: string, position: number | null | undefined) {
  if (position == null) return query;

  const preSql = query.substring(0, position);
  const postSql = query.substring(position);
  const prevNewline = Math.max(0, preSql.lastIndexOf('\n') + 1);
  let nextNewline = postSql.indexOf('\n');
  if (nextNewline < 0) nextNewline = postSql.length;
  nextNewline += preSql.length;
  const gap = ' '.repeat(Math.max(0, position - prevNewline - 1));
  return (
    query.substring(0, nextNewline) +
    '\n' +
    gap +
    '^\n' +
    gap +
    '|\n' +
    gap +
    '+ ERROR POSITION SHOWN ABOVE\n' +
    query.substring(nextNewline)
  );
}
