export function formatQueryWithErrorPosition(query: string, position: number | null | undefined) {
  if (position == null) return query;

  const prevNewline = Math.max(0, query.lastIndexOf('\n', position) + 1);
  let nextNewline = query.indexOf('\n', position);
  if (nextNewline < 0) nextNewline = query.length;
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
