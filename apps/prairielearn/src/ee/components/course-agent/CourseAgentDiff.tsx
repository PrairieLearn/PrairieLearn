function parseDiff(diff: string) {
  const files: { path: string; lines: { id: number; text: string }[] }[] = [];
  let current = { path: 'Changes', lines: [] as { id: number; text: string }[] };
  let nextLineId = 0;

  for (const line of diff.split('\n')) {
    const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (match) {
      if (current.lines.length > 0) files.push(current);
      current = { path: match[2], lines: [{ id: nextLineId++, text: line }] };
    } else {
      current.lines.push({ id: nextLineId++, text: line });
    }
  }
  if (current.lines.length > 0) files.push(current);
  return files;
}

function diffLineClass(line: string) {
  if (line.startsWith('+++') || line.startsWith('---')) return 'course-agent-diff-metadata';
  if (line.startsWith('+')) return 'course-agent-diff-addition';
  if (line.startsWith('-')) return 'course-agent-diff-deletion';
  if (line.startsWith('@@')) return 'course-agent-diff-hunk';
  if (line.startsWith('diff --git') || line.startsWith('index ')) {
    return 'course-agent-diff-metadata';
  }
  return '';
}

export function CourseAgentDiff({ diff }: { diff: string }) {
  return (
    <div className="course-agent-diff border-top">
      {parseDiff(diff).map((file) => (
        <section key={file.path} aria-label={`Changes to ${file.path}`}>
          <div className="course-agent-diff-file border-bottom px-3 py-2 font-monospace small fw-semibold text-break">
            {file.path}
          </div>
          <div className="course-agent-diff-lines overflow-auto border-bottom">
            {file.lines.map((line) => (
              <code key={line.id} className={`course-agent-diff-line ${diffLineClass(line.text)}`}>
                {line.text || ' '}
              </code>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
