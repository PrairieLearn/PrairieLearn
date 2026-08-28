import { type ReactNode, useState } from 'react';
import { Form, Modal } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

const CHAT_TITLES = ['Exam 1 analysis', 'Improve vector-field question', 'Course setup plan'];
const COURSE_INSTANCES = ['Fall 2026', 'Spring 2026', 'Fall 2025'] as const;

const COURSE_DATA_DSL = JSON.stringify(
  {
    resource: 'assessment_attempts',
    select: ['assessment.tid'],
    where: [{ field: 'assessment.tid', op: 'eq', value: 'exam1' }],
    groupBy: ['assessment.tid'],
    metrics: [
      { op: 'avg', field: 'attempt.score_perc', as: 'average_score' },
      { op: 'count', field: 'attempt.id', as: 'attempt_count' },
    ],
    orderBy: [{ field: 'average_score', direction: 'desc' }],
    limit: 20,
  },
  null,
  2,
);

export function CourseAgentPanelMockup() {
  const [open, setOpen] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [expandedTool, setExpandedTool] = useState<'sandbox' | 'query' | null>('sandbox');
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingCourseInstance, setBillingCourseInstance] = useState<
    (typeof COURSE_INSTANCES)[number]
  >(COURSE_INSTANCES[0]);

  return (
    <aside
      className={`course-agent-panel ${open ? 'course-agent-panel-open' : 'course-agent-panel-collapsed'}`}
      aria-label="Course agent panel"
    >
      <div className="course-agent-panel-rail border-start bg-light">
        <button
          type="button"
          className="btn btn-link text-primary p-2"
          aria-label="Open course agent"
          onClick={() => setOpen(true)}
        >
          <i className="bi bi-arrow-bar-left fs-5" />
        </button>
      </div>

      <div className="course-agent-panel-content border-start bg-light">
        <header className="course-agent-header border-bottom bg-white px-2 py-2">
          <div className="d-flex align-items-center gap-2 mb-2">
            <OverlayTrigger
              placement="bottom"
              tooltip={{
                body: 'Collapse',
                props: { id: 'course-agent-collapse-tooltip' },
              }}
            >
              <button
                type="button"
                className="btn btn-sm btn-light"
                aria-label="Collapse course agent"
                onClick={() => setOpen(false)}
              >
                <i className="bi bi-arrow-bar-right" />
              </button>
            </OverlayTrigger>
            <strong>Course Agent</strong>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Form.Select
              size="sm"
              className="course-agent-conversation-picker border-secondary"
              aria-label="Select conversation"
              defaultValue={CHAT_TITLES[0]}
            >
              {CHAT_TITLES.map((title) => (
                <option key={title}>{title}</option>
              ))}
            </Form.Select>
            <OverlayTrigger
              placement="bottom"
              tooltip={{
                body: 'New chat',
                props: { id: 'course-agent-new-chat-tooltip' },
              }}
            >
              <button type="button" className="btn btn-sm btn-light" aria-label="Start new chat">
                <i className="bi bi-pencil-square" />
              </button>
            </OverlayTrigger>
          </div>
        </header>

        <div className="course-agent-transcript px-3 py-3">
          <div className="text-center small text-muted mb-3">Today</div>

          <div className="d-flex justify-content-end mb-3">
            <div className="course-agent-user-message bg-secondary-subtle">
              Analyze Exam 1, then improve the instructions if anything is unclear.
            </div>
          </div>

          <div className="d-flex align-items-start gap-2">
            <span className="course-agent-avatar bg-primary-subtle text-primary">
              <i className="bi bi-stars" />
            </span>
            <div className="min-width-0 flex-grow-1">
              <div className="small text-muted mb-1">Course agent</div>
              <p className="mb-3">
                I’ll start a sandbox, query the Exam 1 attempt data, and inspect the relevant course
                files. I’ll ask before applying any edits.
              </p>

              <ToolCard
                title="Starting sandbox"
                summary="Cloning the latest safe course commit"
                status="ongoing"
                expanded={expandedTool === 'sandbox'}
                onToggle={() => setExpandedTool(expandedTool === 'sandbox' ? null : 'sandbox')}
              >
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="small fw-semibold">Live trace</span>
                  <Form.Check
                    type="switch"
                    id="course-agent-diagnostics"
                    className="small mb-0"
                    label="Diagnostics"
                    checked={showDiagnostics}
                    onChange={(event) => setShowDiagnostics(event.currentTarget.checked)}
                  />
                </div>
                <TraceRow state="complete" text="Allocated Cloudflare sandbox" />
                <TraceRow state="complete" text="Restored conversation workspace" />
                <TraceRow state="ongoing" text="Cloning the latest safe commit" />
                <TraceRow state="queued" text="Preparing PrairieLearn tools" />
                {showDiagnostics && (
                  <div className="border-top mt-2 pt-2 small text-muted">
                    <div className="d-flex justify-content-between">
                      <span>Run</span>
                      <span>run_01J8Q</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Tokens</span>
                      <span>8,432</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Estimated cost</span>
                      <span>$0.08</span>
                    </div>
                  </div>
                )}
              </ToolCard>

              <ToolCard
                title="Query course data"
                summary="Queued until the sandbox is ready"
                status="queued"
                expanded={expandedTool === 'query'}
                onToggle={() => setExpandedTool(expandedTool === 'query' ? null : 'query')}
              >
                <div className="small fw-semibold mb-1">DSL input</div>
                <pre className="course-agent-code border rounded bg-dark text-light p-2 mb-0">
                  <code>{COURSE_DATA_DSL}</code>
                </pre>
              </ToolCard>

              <div className="course-agent-approval border rounded bg-white mt-3 overflow-hidden">
                <div className="border-bottom px-3 py-2">
                  <div className="d-flex align-items-center gap-2 fw-semibold">
                    <i className="bi bi-shield-check text-warning" /> Approval required
                  </div>
                  <div className="small text-muted mt-1">
                    Apply this change to <code>questions/vectorField/question.html</code>?
                  </div>
                </div>
                <pre className="course-agent-diff mb-0 small">
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
                <div className="d-flex justify-content-end gap-2 border-top px-2 py-2">
                  <button type="button" className="btn btn-sm btn-outline-secondary">
                    No
                  </button>
                  <button type="button" className="btn btn-sm btn-primary">
                    Yes, apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="course-agent-footer border-top bg-white p-2">
          <Form onSubmit={(event) => event.preventDefault()}>
            <div className="course-agent-usage small text-muted mb-1 px-1">
              $0.08 used <span aria-hidden="true">·</span> Billing to{' '}
              <button
                type="button"
                className="btn btn-link btn-sm p-0 align-baseline"
                onClick={() => setBillingModalOpen(true)}
              >
                {billingCourseInstance}
              </button>
            </div>
            <Form.Control
              as="textarea"
              rows={2}
              className="course-agent-chat-input shadow-none"
              aria-label="Message course agent"
              placeholder="Ask anything about your course…"
              defaultValue=""
            />
            <div className="course-agent-controls mt-2">
              <button type="button" className="btn btn-sm btn-light" aria-label="Add context">
                <i className="bi bi-plus-lg" />
              </button>
              <Form.Select size="sm" aria-label="Approval mode" defaultValue="ask">
                <option value="ask">Ask for approval</option>
                <option value="always">Always approve</option>
              </Form.Select>
              <Form.Select size="sm" aria-label="Model" defaultValue="sol-5.6">
                <option value="sol-5.6">OpenAI Sol 5.6</option>
                <option value="terra-5.6">OpenAI Terra 5.6</option>
              </Form.Select>
              <button type="submit" className="btn btn-sm btn-primary" aria-label="Send message">
                <i className="bi bi-send-fill" />
              </button>
            </div>
          </Form>
          <div className="text-center text-muted mt-2" style={{ fontSize: '0.75rem' }}>
            AI can make mistakes. Review changes before applying them.
          </div>
        </footer>
      </div>

      <Modal size="sm" show={billingModalOpen} centered onHide={() => setBillingModalOpen(false)}>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">Billing course instance</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
          <div className="list-group list-group-flush">
            {COURSE_INSTANCES.map((courseInstance) => {
              const selected = courseInstance === billingCourseInstance;
              return (
                <button
                  key={courseInstance}
                  type="button"
                  className={`list-group-item list-group-item-action ${selected ? 'active' : ''}`}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => {
                    setBillingCourseInstance(courseInstance);
                    setBillingModalOpen(false);
                  }}
                >
                  {courseInstance}
                </button>
              );
            })}
          </div>
        </Modal.Body>
      </Modal>
    </aside>
  );
}

CourseAgentPanelMockup.displayName = 'CourseAgentPanelMockup';

function ToolCard({
  title,
  summary,
  status,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  status: 'ongoing' | 'queued';
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
        {status === 'ongoing' ? (
          <span
            className="spinner-border spinner-border-sm text-primary"
            aria-label="In progress"
          />
        ) : (
          <i className="bi bi-clock text-muted" />
        )}
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

function TraceRow({ state, text }: { state: 'complete' | 'ongoing' | 'queued'; text: string }) {
  return (
    <div className="d-flex align-items-center gap-2 py-1 small">
      {state === 'complete' && <i className="bi bi-check-circle-fill text-success" />}
      {state === 'ongoing' && (
        <span className="spinner-border spinner-border-sm text-primary" aria-hidden="true" />
      )}
      {state === 'queued' && <i className="bi bi-circle text-muted" />}
      <span className={state === 'queued' ? 'text-muted' : undefined}>{text}</span>
    </div>
  );
}
