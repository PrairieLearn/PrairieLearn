import type { ReactNode } from 'react';
import { Modal } from 'react-bootstrap';

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  lines: string[];
}

export function parseCourseAgentDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = {
        path: line.replace(/^diff --git .*? b\//, ''),
        additions: 0,
        deletions: 0,
        lines: [],
      };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;
    if (!inHunk && (line.startsWith('+++ ') || line.startsWith('--- '))) {
      const name = line.slice(4);
      if (name !== '/dev/null') current.path = name.replace(/^[ab]\//, '');
      continue;
    }
    if (line.startsWith('@@')) inHunk = true;
    if (inHunk && /^[ +\-@\\]/.test(line)) {
      current.lines.push(line);
      if (line.startsWith('+')) current.additions++;
      if (line.startsWith('-')) current.deletions++;
    } else if (line === 'GIT binary patch' || line.startsWith('Binary files ')) {
      current.lines.push('Binary file changed');
    }
  }
  return files;
}

function diffLineClass(line: string) {
  if (line.startsWith('+')) return 'course-agent-diff-addition';
  if (line.startsWith('-')) return 'course-agent-diff-deletion';
  if (line.startsWith('@@')) return 'course-agent-diff-hunk';
  return '';
}

export function CourseAgentDiffSummary({ diff }: { diff: string }) {
  const files = parseCourseAgentDiff(diff);
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  return (
    <p className="small text-muted my-2">
      {files.length} {files.length === 1 ? 'file' : 'files'} changed ·{' '}
      <span aria-label={`Total: ${additions} additions, ${deletions} deletions`}>
        <span className="text-success">+{additions}</span>{' '}
        <span className="text-danger">−{deletions}</span> lines
      </span>
    </p>
  );
}

export function CourseAgentDiff({ diff }: { diff: string }) {
  return (
    <div className="course-agent-diff border-top">
      {parseCourseAgentDiff(diff).map((file) => (
        <section key={file.path} aria-label={`Changes to ${file.path}`}>
          <div className="course-agent-diff-file border-bottom px-3 py-2 font-monospace small fw-semibold text-break">
            {file.path}
          </div>
          <div className="course-agent-diff-lines border-bottom">
            <pre className="m-0 border-0 rounded-0">
              {file.lines.length > 0 ? (
                file.lines.map((line, index) => (
                  // Diff lines are an immutable snapshot with no per-line state.
                  // eslint-disable-next-line @eslint-react/no-array-index-key
                  <span key={index} className={`course-agent-diff-line ${diffLineClass(line)}`}>
                    {line}
                    {'\n'}
                  </span>
                ))
              ) : (
                <span className="course-agent-diff-line">File metadata changed</span>
              )}
            </pre>
          </div>
        </section>
      ))}
    </div>
  );
}

export function CourseAgentDiffReview({
  diff,
  show,
  onHide,
  children,
}: {
  diff: string;
  show: boolean;
  onHide: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      show={show}
      aria-labelledby="course-agent-review-title"
      size="xl"
      centered
      scrollable
      onHide={onHide}
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5" id="course-agent-review-title">
          Proposed changes
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0" aria-label="Proposed changes diff">
        <CourseAgentDiff diff={diff} />
      </Modal.Body>
      <Modal.Footer>{children}</Modal.Footer>
    </Modal>
  );
}
