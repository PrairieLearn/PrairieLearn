import { type ReactNode, useState } from 'react';
import { Dropdown, Form, Modal } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

const CHAT_TITLES = ['Exam 1 analysis', 'Improve vector-field question', 'Course setup plan'];
const COURSE_INSTANCES = [
  {
    id: 'fall-2026',
    longName: 'Fall 2026',
    shortName: 'Fa26',
    billing: { kind: 'credits', balance: '$18.42', selectable: true },
  },
  {
    id: 'spring-2026',
    longName: 'Spring 2026',
    shortName: 'Sp26',
    billing: { kind: 'credits', balance: '$7.05', selectable: true },
  },
  {
    id: 'fall-2025',
    longName: 'Fall 2025',
    shortName: 'Fa25',
    billing: { kind: 'credits', balance: '$0.00', selectable: false },
  },
  {
    id: 'summer-2026',
    longName: 'Summer 2026',
    shortName: 'Su26',
    billing: { kind: 'byok', providers: ['OpenAI', 'Google'] },
  },
] as const;

const COURSE_AGENT_MODELS = [
  {
    id: 'sol-5.6',
    provider: 'OpenAI',
    name: 'OpenAI Sol 5.6',
    tier: 'Higher quality',
    relativeCost: '5x',
  },
  {
    id: 'luna-5.6',
    provider: 'OpenAI',
    name: 'OpenAI Luna 5.6',
    tier: 'Faster, lower cost',
    relativeCost: '1x',
  },
  {
    id: 'claude-opus-4-7',
    provider: 'Anthropic',
    name: 'Claude Opus 4.7',
    tier: 'Higher quality',
    relativeCost: '5x',
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'Anthropic',
    name: 'Claude Haiku 4.5',
    tier: 'Faster, lower cost',
    relativeCost: '1x',
  },
] as const;

export function CourseAgentPanelMockup() {
  const [open, setOpen] = useState(true);
  const [selectedChat, setSelectedChat] = useState(CHAT_TITLES[0]);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingCourseInstanceId, setBillingCourseInstanceId] =
    useState<(typeof COURSE_INSTANCES)[number]['id']>('fall-2026');
  const [approvalMode, setApprovalMode] = useState<'ask' | 'always'>('ask');
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] =
    useState<(typeof COURSE_AGENT_MODELS)[number]['id']>('sol-5.6');
  const [pendingModelId, setPendingModelId] =
    useState<(typeof COURSE_AGENT_MODELS)[number]['id']>('sol-5.6');

  const billingCourseInstance =
    COURSE_INSTANCES.find(({ id }) => id === billingCourseInstanceId) ?? COURSE_INSTANCES[0];
  const selectedModel =
    COURSE_AGENT_MODELS.find(({ id }) => id === selectedModelId) ?? COURSE_AGENT_MODELS[0];

  return (
    <aside
      className={`course-agent-panel ${open ? 'course-agent-panel-open' : 'course-agent-panel-collapsed'}`}
      aria-label="Course agent panel"
    >
      <div className="course-agent-panel-rail border-start bg-light">
        <OverlayTrigger
          placement="left"
          tooltip={{
            body: 'Expand course agent',
            props: { id: 'course-agent-expand-tooltip' },
          }}
        >
          <button
            type="button"
            className="btn btn-link text-primary p-2"
            aria-label="Expand course agent"
            onClick={() => setOpen(true)}
          >
            <i className="bi bi-arrow-bar-left fs-5" />
          </button>
        </OverlayTrigger>
      </div>

      <div className="course-agent-panel-content border-start bg-light">
        <header className="course-agent-header border-bottom bg-white px-3 py-3">
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
            <strong className="d-flex align-items-center gap-2">
              <i className="bi bi-stars text-primary" aria-hidden="true" /> Course Agent
            </strong>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Dropdown className="min-width-0 flex-grow-1">
              <Dropdown.Toggle
                size="sm"
                variant="light"
                className="course-agent-conversation-picker d-flex w-100 align-items-center justify-content-between border bg-white text-start"
                aria-label="Select conversation"
              >
                <span className="text-truncate">{selectedChat}</span>
              </Dropdown.Toggle>
              <Dropdown.Menu className="course-agent-conversation-menu w-100 py-0 overflow-hidden">
                {CHAT_TITLES.map((title) => (
                  <Dropdown.Item
                    key={title}
                    active={selectedChat === title}
                    onClick={() => setSelectedChat(title)}
                  >
                    {title}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
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

        <div className="course-agent-transcript px-4 py-4">
          <div className="text-center small text-muted mb-3">Today</div>

          <UserMessage>
            Please create a Fall 2027 version of my Fall 2026 course instance.
          </UserMessage>
          <AgentMessage>
            <CompletedToolCall>Set up the course sandbox</CompletedToolCall>
            <CompletedToolCall>
              Read <code>courseInstances/Fa26</code>
            </CompletedToolCall>
            <CompletedToolCall>Prepared a Fall 2027 course instance</CompletedToolCall>
            <CompletedToolCall>Validated the proposed course changes</CompletedToolCall>
            <div className="course-agent-accepted-approval border rounded px-2 py-2 small">
              <div className="d-flex align-items-center gap-2 fw-semibold text-success">
                <i className="bi bi-shield-check" aria-hidden="true" /> Approval accepted
              </div>
              <div className="mt-1">
                Created <code>courseInstances/Fa27</code> from Fall 2026.
              </div>
            </div>
            <CompletedToolCall>Applied and validated the approved changes</CompletedToolCall>
            <p className="mb-0">
              Fall 2027 was created with the Fall 2026 assessments and settings. I updated its
              dates, short name, and display name, and the course validated successfully.
            </p>
          </AgentMessage>

          <UserMessage>Where did students tend to fail in Fall 2026?</UserMessage>
          <AgentMessage>
            <CompletedToolCall>Restored the course sandbox</CompletedToolCall>
            <CompletedToolCall>Queried Fall 2026 submission performance</CompletedToolCall>
            <CompletedToolCall>Read the three lowest-performing question files</CompletedToolCall>
            <CompletedToolCall>
              Compared attempts, scores, and common incorrect answers
            </CompletedToolCall>
            <p className="mb-0">
              The lowest-performing item was the question <strong>Vector-field direction</strong> (
              <code>vectorField</code>, 41% average). Most errors came from confusing the field’s
              magnitude with its direction.
            </p>
            <PerformanceVisualization />
          </AgentMessage>

          <UserMessage>
            Got it. Make <code>vectorField</code> easier by showing the evaluated field components
            at the point and asking students only to choose and justify the direction.
          </UserMessage>
          <AgentMessage>
            <CompletedToolCall>
              Read <code>questions/vectorField/question.html</code>
            </CompletedToolCall>
            <CompletedToolCall>
              Read <code>questions/vectorField/server.py</code>
            </CompletedToolCall>
            <CompletedToolCall>Prepared and validated the question edits</CompletedToolCall>
            <p className="mb-0">I prepared the following changes for your approval.</p>
            <DiffApproval />
          </AgentMessage>
        </div>

        <footer className="course-agent-footer border-top bg-white p-3">
          <Form onSubmit={(event) => event.preventDefault()}>
            <div className="course-agent-usage small text-muted mb-1 px-1">
              $0.08 used <span aria-hidden="true">·</span> Billing to{' '}
              <button
                type="button"
                className="btn btn-link btn-sm p-0 align-baseline"
                onClick={() => setBillingModalOpen(true)}
              >
                {billingCourseInstance.longName}
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
            <div className="course-agent-controls d-flex align-items-center gap-1 mt-2">
              <OverlayTrigger
                placement="top"
                tooltip={{
                  body: 'Attach file',
                  props: { id: 'course-agent-attach-tooltip' },
                }}
              >
                <button type="button" className="btn btn-sm btn-light" aria-label="Attach file">
                  <i className="bi bi-paperclip" />
                </button>
              </OverlayTrigger>
              <span className="text-muted" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className="btn btn-sm btn-link text-decoration-none text-nowrap px-1"
                onClick={() => setApprovalMode(approvalMode === 'ask' ? 'always' : 'ask')}
              >
                {approvalMode === 'ask' ? 'Ask for approval' : 'Always approve'}
              </button>
              <span className="text-muted" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className="btn btn-sm btn-link text-decoration-none text-truncate px-1"
                onClick={() => {
                  setPendingModelId(selectedModelId);
                  setModelModalOpen(true);
                }}
              >
                {selectedModel.name}
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary ms-auto"
                aria-label="Send message"
              >
                <i className="bi bi-send-fill" />
              </button>
            </div>
          </Form>
          <div className="text-center text-muted mt-2" style={{ fontSize: '0.75rem' }}>
            AI can make mistakes. Review changes before applying them.
          </div>
        </footer>
      </div>

      <Modal size="lg" show={billingModalOpen} centered onHide={() => setBillingModalOpen(false)}>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">Billing course instance</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted mb-3">
            Choose the course instance that will pay for this conversation’s AI usage.
          </p>
          <div className="border rounded overflow-hidden">
            {COURSE_INSTANCES.map((courseInstance) => {
              const selected = courseInstance.id === billingCourseInstanceId;
              const selectable =
                courseInstance.billing.kind === 'byok' || courseInstance.billing.selectable;
              const option = (
                <button
                  key={courseInstance.id}
                  type="button"
                  className={`course-agent-instance-option d-flex w-100 align-items-center gap-3 border-0 border-bottom px-3 py-2 text-start ${selected ? 'bg-primary-subtle' : 'bg-white'}`}
                  aria-current={selected ? 'true' : undefined}
                  disabled={!selectable}
                  onClick={() => {
                    setBillingCourseInstanceId(courseInstance.id);
                    setBillingModalOpen(false);
                  }}
                >
                  <span className="course-agent-instance-name min-width-0 text-truncate text-primary">
                    {courseInstance.longName}
                  </span>
                  <span className="course-agent-instance-short-name text-muted">
                    {courseInstance.shortName}
                  </span>
                  <span className="course-agent-instance-billing ms-auto text-end">
                    {courseInstance.billing.kind === 'credits' ? (
                      <>
                        <span className="d-block fw-semibold text-body">
                          {courseInstance.billing.balance}
                        </span>
                        <span className="d-block small text-muted">AI credit balance</span>
                      </>
                    ) : (
                      <>
                        <span className="badge text-bg-secondary">BYOK</span>
                        <span className="d-block small text-muted">
                          Custom keys for {courseInstance.billing.providers.join(' and ')}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="course-agent-instance-selected">
                    {selected && <i className="bi bi-check-circle-fill text-primary" />}
                  </span>
                </button>
              );

              return selectable ? (
                option
              ) : (
                <OverlayTrigger
                  key={courseInstance.id}
                  placement="top"
                  tooltip={{
                    body: 'This course instance has no AI credits available.',
                    props: { id: `course-agent-billing-tooltip-${courseInstance.id}` },
                  }}
                >
                  <div>{option}</div>
                </OverlayTrigger>
              );
            })}
          </div>
        </Modal.Body>
      </Modal>

      <Modal size="md" show={modelModalOpen} centered onHide={() => setModelModalOpen(false)}>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">Course agent model</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex align-items-center justify-content-between gap-2 mb-3 small text-muted">
            <span>All models available</span>
            <OverlayTrigger
              placement="top"
              tooltip={{
                body: 'Relative cost compared with the lowest-cost model.',
                props: { id: 'course-agent-relative-cost-tooltip' },
              }}
            >
              <span className="text-nowrap">
                Relative cost <i className="bi bi-question-circle" aria-hidden="true" />
              </span>
            </OverlayTrigger>
          </div>
          {(['OpenAI', 'Anthropic'] as const).map((provider) => (
            <div key={provider} className="mb-3">
              <div className="fw-semibold mb-2">{provider}</div>
              <div className="d-flex flex-column gap-1">
                {COURSE_AGENT_MODELS.filter((model) => model.provider === provider).map((model) => {
                  const selected = model.id === pendingModelId;
                  return (
                    <label
                      key={model.id}
                      htmlFor={`course-agent-model-${model.id}`}
                      className={`course-agent-model-option rounded-2 border px-3 py-2 mb-0 ${selected ? 'border-primary bg-primary-subtle' : 'border-transparent'}`}
                    >
                      <Form.Check
                        type="radio"
                        id={`course-agent-model-${model.id}`}
                        name="course-agent-model"
                        className="course-agent-model-check mb-0"
                        checked={selected}
                        label={
                          <span className="d-flex align-items-center justify-content-between gap-3">
                            <span>
                              <span className="d-block fw-medium">{model.name}</span>
                              <span className="d-block small text-muted">{model.tier}</span>
                            </span>
                            <span className="small text-muted text-nowrap">
                              {model.relativeCost}
                            </span>
                          </span>
                        }
                        onChange={() => setPendingModelId(model.id)}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSelectedModelId(pendingModelId);
              setModelModalOpen(false);
            }}
          >
            Select
          </button>
        </Modal.Footer>
      </Modal>
    </aside>
  );
}

CourseAgentPanelMockup.displayName = 'CourseAgentPanelMockup';

function UserMessage({ children }: { children: ReactNode }) {
  return (
    <div
      className="d-flex flex-column align-items-end mb-4"
      role="article"
      aria-label="Message from you"
    >
      <div className="course-agent-user-message d-flex flex-column gap-2 rounded bg-secondary-subtle p-3">
        {children}
      </div>
    </div>
  );
}

function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <div
      className="d-flex flex-column gap-2 mb-4"
      role="article"
      aria-label="Message from PrairieLearn"
    >
      {children}
    </div>
  );
}

function CompletedToolCall({ children }: { children: ReactNode }) {
  return (
    <div className="small text-muted">
      <div className="d-flex flex-row align-items-center gap-1">
        <i className="bi bi-fw bi-check-lg text-success" aria-hidden="true" />
        <div className="min-width-0 flex-grow-1">{children}</div>
      </div>
    </div>
  );
}

function PerformanceVisualization() {
  const rows = [
    { title: 'Vector-field direction', qid: 'vectorField', score: 41 },
    { title: 'Line integral setup', qid: 'lineIntegralSetup', score: 54 },
    {
      title: 'Jacobian change of variables',
      qid: 'jacobianChangeOfVariables',
      score: 59,
    },
  ];

  return (
    <div
      className="course-agent-visualization border rounded bg-white p-3"
      role="img"
      aria-label="Fall 2026 lowest average question scores: Vector-field direction 41 percent, Line integral setup 54 percent, and Jacobian change of variables 59 percent"
    >
      <div className="d-flex align-items-baseline justify-content-between gap-2 mb-3">
        <span className="fw-semibold">Lowest average scores</span>
        <span className="small text-muted">Fall 2026</span>
      </div>
      <div className="d-flex flex-column gap-2">
        {rows.map(({ title, qid, score }) => (
          <div key={qid} className="course-agent-chart-row small">
            <span className="min-width-0">
              <span className="d-block text-truncate fw-medium" title={title}>
                {title}
              </span>
              <code className="d-block text-truncate small" title={qid}>
                {qid}
              </code>
            </span>
            <span className="course-agent-chart-track">
              <span className="course-agent-chart-bar" style={{ width: `${score}%` }} />
            </span>
            <span className="text-end fw-medium">{score}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiffApproval() {
  return (
    <div className="course-agent-approval border rounded bg-white overflow-hidden">
      <div className="border-bottom px-3 py-2">
        <div className="d-flex align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2 fw-semibold">
            <i className="bi bi-shield-check text-warning" aria-hidden="true" /> Approval required
          </div>
          <span className="small text-nowrap">
            2 files changed <span className="text-success">+9</span>{' '}
            <span className="text-danger">−11</span>
          </span>
        </div>
      </div>

      <div className="course-agent-diff-files p-2">
        <DiffFile path="questions/vectorField/question.html" additions={6} deletions={5}>
          <DiffLine kind="range" oldLine="" newLine="" text="@@ -12,10 +12,11 @@" />
          <DiffLine kind="context" oldLine="12" newLine="12" text="<pl-question-panel>" />
          <DiffLine
            kind="remove"
            oldLine="13"
            newLine=""
            text="  <p>Evaluate the vector field at the point shown.</p>"
          />
          <DiffLine
            kind="remove"
            oldLine="14"
            newLine=""
            text="  <p>Normalize the result and select its direction.</p>"
          />
          <DiffLine
            kind="add"
            oldLine=""
            newLine="13"
            text="  <p>At this point, the field evaluates to</p>"
          />
          <DiffLine
            kind="add"
            oldLine=""
            newLine="14"
            text={'  <p>\\(\\vec F = ({{params.fx}}, {{params.fy}})\\).</p>'}
          />
          <DiffLine
            kind="add"
            oldLine=""
            newLine="15"
            text="  <p>Select its direction and briefly justify your choice.</p>"
          />
          <DiffLine kind="context" oldLine="15" newLine="16" text="</pl-question-panel>" />
          <DiffLine kind="range" oldLine="" newLine="" text="@@ -29,7 +30,9 @@" />
          <DiffLine
            kind="remove"
            oldLine="29"
            newLine=""
            text={'<pl-vector-input answers-name="direction" normalize="true" />'}
          />
          <DiffLine
            kind="add"
            oldLine=""
            newLine="30"
            text={'<pl-multiple-choice answers-name="direction">'}
          />
          <DiffLine kind="add" oldLine="" newLine="31" text="  <!-- direction choices -->" />
          <DiffLine kind="add" oldLine="" newLine="32" text="</pl-multiple-choice>" />
        </DiffFile>

        <DiffFile path="questions/vectorField/server.py" additions={3} deletions={6}>
          <DiffLine
            kind="range"
            oldLine=""
            newLine=""
            text="@@ -18,13 +18,10 @@ def generate(data):"
          />
          <DiffLine kind="context" oldLine="18" newLine="18" text="    fx = 2 * x - y" />
          <DiffLine kind="context" oldLine="19" newLine="19" text="    fy = x + 3 * y" />
          <DiffLine
            kind="remove"
            oldLine="20"
            newLine=""
            text="    magnitude = math.sqrt(fx**2 + fy**2)"
          />
          <DiffLine kind="remove" oldLine="21" newLine="" text="    ux = fx / magnitude" />
          <DiffLine kind="remove" oldLine="22" newLine="" text="    uy = fy / magnitude" />
          <DiffLine kind="add" oldLine="" newLine="20" text="    data['params']['fx'] = fx" />
          <DiffLine kind="add" oldLine="" newLine="21" text="    data['params']['fy'] = fy" />
          <DiffLine
            kind="add"
            oldLine=""
            newLine="22"
            text="    data['correct_answers']['direction'] = direction(fx, fy)"
          />
          <DiffLine kind="range" oldLine="" newLine="" text="@@ -42,4 +39,2 @@ def grade(data):" />
          <DiffLine kind="remove" oldLine="42" newLine="" text="    grade_vector_length(data)" />
          <DiffLine kind="remove" oldLine="43" newLine="" text="    grade_normalization(data)" />
          <DiffLine kind="remove" oldLine="44" newLine="" text="    grade_direction(data)" />
        </DiffFile>
      </div>

      <div className="d-flex justify-content-end gap-2 border-top px-2 py-2">
        <button type="button" className="btn btn-sm btn-primary">
          Approve
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary">
          Always approve
        </button>
        <button type="button" className="btn btn-sm btn-outline-danger">
          Deny
        </button>
      </div>
    </div>
  );
}

function DiffFile({
  path,
  additions,
  deletions,
  children,
}: {
  path: string;
  additions: number;
  deletions: number;
  children: ReactNode;
}) {
  return (
    <div className="border rounded mb-2 overflow-hidden">
      <div className="d-flex align-items-center gap-2 border-bottom bg-body-tertiary px-2 py-1 small">
        <i className="bi bi-file-earmark-code text-muted" aria-hidden="true" />
        <code className="text-truncate flex-grow-1">{path}</code>
        <span className="text-success">+{additions}</span>
        <span className="text-danger">−{deletions}</span>
      </div>
      <div className="course-agent-file-diff">{children}</div>
    </div>
  );
}

function DiffLine({
  kind,
  oldLine,
  newLine,
  text,
}: {
  kind: 'context' | 'add' | 'remove' | 'range';
  oldLine: string;
  newLine: string;
  text: string;
}) {
  return (
    <div className={`course-agent-diff-line course-agent-diff-line-${kind}`}>
      <span className="course-agent-line-number">{oldLine}</span>
      <span className="course-agent-line-number">{newLine}</span>
      <code>
        {kind === 'add' ? '+' : kind === 'remove' ? '−' : ' '}
        {text}
      </code>
    </div>
  );
}
