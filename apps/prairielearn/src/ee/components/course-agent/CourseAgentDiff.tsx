import type { ReactNode } from 'react';
import { Modal } from 'react-bootstrap';

interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
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
        status: 'modified',
        additions: 0,
        deletions: 0,
        lines: [],
      };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;
    if (!inHunk && line.startsWith('new file mode ')) current.status = 'added';
    if (!inHunk && line.startsWith('deleted file mode ')) current.status = 'deleted';
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
    <div className="course-agent-diff p-3">
      {parseCourseAgentDiff(diff).map((file) => {
        const filename = file.path.split('/').at(-1)!;
        const directory = file.path.slice(0, -filename.length);
        return (
          <section
            key={file.path}
            aria-label={`Changes to ${file.path}`}
            className="course-agent-diff-section border rounded"
          >
            <div className="course-agent-diff-file border-bottom px-3 py-2 d-flex align-items-center gap-2">
              <div className="font-monospace small text-break flex-grow-1">
                <div className="text-muted">{directory}</div>
                <div className="fw-semibold">{filename}</div>
              </div>
              {file.status !== 'modified' && (
                <span
                  className={`badge ${file.status === 'added' ? 'text-bg-success' : 'text-bg-danger'}`}
                >
                  {file.status === 'added' ? 'Added' : 'Deleted'}
                </span>
              )}
            </div>
            <div className="course-agent-diff-lines py-3">
              <pre className="m-0 border-0 rounded-0">
                {file.lines.length > 0 ? (
                  file.lines.map((line, index) => {
                    if (line.startsWith('@@')) {
                      // Separate noncontiguous hunks without exposing Git's raw range syntax.
                      return index > 0 ? (
                        <span
                          // eslint-disable-next-line @eslint-react/no-array-index-key
                          key={index}
                          className="course-agent-diff-separator"
                          role="separator"
                          aria-label="Changed section"
                        />
                      ) : null;
                    }
                    const sourceLine = /^[ +-]/.test(line);
                    return (
                      <span
                        // Diff lines are an immutable snapshot with no per-line state.
                        // eslint-disable-next-line @eslint-react/no-array-index-key
                        key={index}
                        className={`course-agent-diff-line ${file.status === 'added' ? '' : diffLineClass(line)}`}
                      >
                        {file.status !== 'added' && (
                          <span className="course-agent-diff-marker" aria-hidden="true">
                            {sourceLine ? line[0] : ' '}
                          </span>
                        )}
                        <span className="course-agent-diff-text">
                          {sourceLine ? line.slice(1) : line}
                          {'\n'}
                        </span>
                      </span>
                    );
                  })
                ) : (
                  <span className="course-agent-diff-line">File metadata changed</span>
                )}
              </pre>
            </div>
          </section>
        );
      })}
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
