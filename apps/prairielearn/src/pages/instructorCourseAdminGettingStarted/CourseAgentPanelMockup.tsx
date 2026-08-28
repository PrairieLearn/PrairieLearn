import { type ReactNode, useState } from 'react';
import { Form } from 'react-bootstrap';

const CHAT_TITLES = ['Exam 1 performance', 'Revise vector fields', 'Course setup help'];

export function CourseAgentPanelMockup() {
  const [open, setOpen] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [expandedActivity, setExpandedActivity] = useState<'data' | 'diff' | null>('data');

  return (
    <aside
      className={`course-agent-panel ${open ? 'course-agent-panel-open' : 'course-agent-panel-collapsed'}`}
      aria-label="Course agent panel"
    >
      <div className="course-agent-panel-rail border-start bg-light">
        <button
          type="button"
          className="btn btn-link text-body p-2"
          aria-label="Open course agent"
          onClick={() => setOpen(true)}
        >
          <i className="bi bi-chevron-left" />
        </button>
        <button
          type="button"
          className="btn btn-link text-primary p-2"
          aria-label="Open course agent chat"
          onClick={() => setOpen(true)}
        >
          <i className="bi bi-stars fs-5" />
        </button>
      </div>

      <div className="course-agent-panel-content border-start bg-light">
        <header className="border-bottom bg-white">
          <div className="d-flex align-items-center gap-2 px-3 py-2">
            <span
              className="d-inline-flex align-items-center justify-content-center rounded bg-primary text-white"
              style={{ width: 30, height: 30 }}
            >
              <i className="bi bi-stars small" />
            </span>
            <div className="min-width-0 flex-grow-1">
              <div className="fw-semibold lh-sm">Course agent</div>
              <div className="small text-muted">
                <span className="text-success me-1">●</span>Ready
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-light" aria-label="Start new chat">
              <i className="bi bi-plus-lg" />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-light"
              aria-label="Collapse course agent"
              onClick={() => setOpen(false)}
            >
              <i className="bi bi-chevron-right" />
            </button>
          </div>

          <div className="d-flex align-items-center gap-1 border-top px-2 py-2">
            <Form.Select size="sm" aria-label="Select chat" defaultValue={CHAT_TITLES[0]}>
              {CHAT_TITLES.map((title) => (
                <option key={title}>{title}</option>
              ))}
            </Form.Select>
            <button type="button" className="btn btn-sm btn-light" aria-label="Rename chat">
              <i className="bi bi-pencil" />
            </button>
            <button type="button" className="btn btn-sm btn-light" aria-label="More chat options">
              <i className="bi bi-three-dots" />
            </button>
          </div>
        </header>

        <div className="course-agent-transcript px-3 py-3">
          <div className="text-center small text-muted mb-3">Today</div>

          <div className="d-flex justify-content-end mb-3">
            <div className="course-agent-user-message bg-secondary-subtle">
              Which Exam 1 questions did students struggle with most? Show me the data.
            </div>
          </div>

          <div className="d-flex align-items-start gap-2">
            <span className="course-agent-avatar bg-primary-subtle text-primary">
              <i className="bi bi-stars" />
            </span>
            <div className="min-width-0 flex-grow-1">
              <div className="small text-muted mb-2">Course agent</div>

              <ActivityCard
                icon="bi-database"
                title="Queried course data"
                summary="86 assessment attempts"
                expanded={expandedActivity === 'data'}
                onToggle={() => setExpandedActivity(expandedActivity === 'data' ? null : 'data')}
              >
                <div className="table-responsive">
                  <table className="table table-sm table-borderless align-middle mb-1 small">
                    <thead className="border-bottom">
                      <tr>
                        <th>Question</th>
                        <th className="text-end">Average</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Vector fields</td>
                        <td className="text-end text-danger fw-semibold">42%</td>
                      </tr>
                      <tr>
                        <td>Line integrals</td>
                        <td className="text-end">51%</td>
                      </tr>
                      <tr>
                        <td>Gradient interpretation</td>
                        <td className="text-end">58%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="d-flex gap-2 mt-2">
                  <button type="button" className="btn btn-sm btn-outline-secondary py-0">
                    <i className="bi bi-download me-1" /> CSV
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-secondary py-0">
                    <i className="bi bi-download me-1" /> JSON
                  </button>
                </div>
              </ActivityCard>

              <p className="mt-3 mb-2">
                <strong>Vector fields</strong> was the hardest question, followed by line integrals
                and gradient interpretation. The most common issue was choosing a direction before
                evaluating the field.
              </p>

              <div className="course-agent-artifact border rounded bg-white mb-2">
                <div className="d-flex align-items-center justify-content-between border-bottom px-2 py-1 small">
                  <span className="fw-semibold">
                    <i className="bi bi-bar-chart me-1 text-primary" /> Question performance
                  </span>
                  <span className="badge text-bg-light border">Visualization</span>
                </div>
                <svg
                  className="d-block w-100"
                  viewBox="0 0 320 112"
                  role="img"
                  aria-label="Bar chart showing three question average scores"
                >
                  <line x1="95" y1="16" x2="95" y2="96" stroke="#dee2e6" />
                  <text x="8" y="34" fontSize="11" fill="currentColor">
                    Vector fields
                  </text>
                  <rect x="100" y="21" width="88" height="16" rx="3" fill="#dc3545" />
                  <text x="194" y="33" fontSize="11" fill="currentColor">
                    42%
                  </text>
                  <text x="8" y="61" fontSize="11" fill="currentColor">
                    Line integrals
                  </text>
                  <rect x="100" y="48" width="107" height="16" rx="3" fill="#f0ad4e" />
                  <text x="213" y="60" fontSize="11" fill="currentColor">
                    51%
                  </text>
                  <text x="8" y="88" fontSize="11" fill="currentColor">
                    Gradient
                  </text>
                  <rect x="100" y="75" width="122" height="16" rx="3" fill="#0d6efd" />
                  <text x="228" y="87" fontSize="11" fill="currentColor">
                    58%
                  </text>
                </svg>
              </div>

              <ActivityCard
                icon="bi-file-diff"
                title="Proposed question.html revision"
                summary="4 lines changed"
                expanded={expandedActivity === 'diff'}
                onToggle={() => setExpandedActivity(expandedActivity === 'diff' ? null : 'diff')}
              >
                <pre className="course-agent-diff rounded mb-0 small">
                  <code>
                    <span className="d-block bg-danger-subtle text-danger">
                      - Choose the vector direction.
                    </span>
                    <span className="d-block bg-success-subtle text-success">
                      + Evaluate the field, then choose its direction.
                    </span>
                    <span className="d-block bg-success-subtle text-success">
                      + Explain your direction choice.
                    </span>
                  </code>
                </pre>
              </ActivityCard>

              {showDiagnostics && (
                <div className="border rounded bg-body-tertiary p-2 mt-2 small text-muted">
                  <div className="fw-semibold text-body mb-1">Developer diagnostics</div>
                  <div className="d-flex justify-content-between">
                    <span>Run</span>
                    <span>run_01J8Q</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Sandbox</span>
                    <span>ready · 4.8 s</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Context</span>
                    <span>8,432 tokens</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="border-top bg-white p-2">
          <div className="d-flex align-items-center justify-content-between px-1 pb-2 small text-muted">
            <span>8,432 tokens · est. $0.08</span>
            <Form.Check
              type="switch"
              id="course-agent-diagnostics"
              className="mb-0"
              label="Diagnostics"
              checked={showDiagnostics}
              onChange={(event) => setShowDiagnostics(event.currentTarget.checked)}
            />
          </div>
          <Form onSubmit={(event) => event.preventDefault()}>
            <div className="course-agent-composer border rounded bg-white p-2">
              <Form.Control
                as="textarea"
                rows={2}
                className="border-0 shadow-none"
                aria-label="Message course agent"
                placeholder="Ask anything about your course…"
                defaultValue=""
              />
              <div className="d-flex align-items-center justify-content-between px-1">
                <button
                  type="button"
                  className="btn btn-sm btn-link text-muted p-1"
                  aria-label="Attach files"
                >
                  <i className="bi bi-paperclip" />
                </button>
                <button type="submit" className="btn btn-sm btn-primary" aria-label="Send message">
                  <i className="bi bi-send-fill" />
                </button>
              </div>
            </div>
          </Form>
          <div className="text-center text-muted mt-1" style={{ fontSize: '0.75rem' }}>
            Static prototype · Nothing is sent or saved
          </div>
        </footer>
      </div>
    </aside>
  );
}

CourseAgentPanelMockup.displayName = 'CourseAgentPanelMockup';

function ActivityCard({
  icon,
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  icon: string;
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border rounded bg-white mb-2 overflow-hidden">
      <button
        type="button"
        className="btn w-100 border-0 rounded-0 d-flex align-items-center gap-2 px-2 py-2 text-start"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <i className={`bi ${icon} text-success`} />
        <span className="flex-grow-1 min-width-0">
          <span className="d-block small fw-semibold">{title}</span>
          <span className="d-block small text-muted">{summary}</span>
        </span>
        <i className={`bi bi-chevron-${expanded ? 'up' : 'down'} small text-muted`} />
      </button>
      {expanded && <div className="border-top px-2 py-2">{children}</div>}
    </div>
  );
}
