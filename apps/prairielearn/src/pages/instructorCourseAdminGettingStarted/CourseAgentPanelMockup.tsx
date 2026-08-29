import { registerCustomLanguage, registerCustomTheme } from '@pierre/diffs';
import { PatchDiff } from '@pierre/diffs/react';
import htmlLanguage from '@shikijs/langs/html';
import pythonLanguage from '@shikijs/langs/python';
import githubLightTheme from '@shikijs/themes/github-light';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Dropdown, Form, Modal } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

const CHAT_TITLES = [
  'Prepare Fall 2027 course',
  'Improve vector-field question',
  'Course setup plan',
];
const COURSE_AGENT_MODEL = 'OpenAI Sol 5.6';

registerCustomLanguage('html', () => Promise.resolve({ default: htmlLanguage }));
registerCustomLanguage('python', () => Promise.resolve({ default: pythonLanguage }));
registerCustomTheme('github-light', () => Promise.resolve(githubLightTheme));

const DIFF_OPTIONS = {
  diffStyle: 'unified',
  overflow: 'scroll',
  hunkSeparators: 'line-info-basic',
  lineDiffType: 'word-alt',
  theme: 'github-light',
  themeType: 'light',
} as const;

const QUESTION_HTML_PATCH = `diff --git a/questions/vectorField/question.html b/questions/vectorField/question.html
index 291f246..b74d5e9 100644
--- a/questions/vectorField/question.html
+++ b/questions/vectorField/question.html
@@ -12,4 +12,5 @@
 <pl-question-panel>
-  <p>Evaluate the vector field at the point shown.</p>
-  <p>Normalize the result and select its direction.</p>
+  <p>At this point, the field evaluates to</p>
+  <p>\\(\\vec F = ({{params.fx}}, {{params.fy}})\\).</p>
+  <p>Select its direction and briefly justify your choice.</p>
 </pl-question-panel>
@@ -29,3 +30,3 @@
-<pl-vector-input answers-name="direction" normalize="true" />
-<pl-hint level="1">Normalize the vector before answering.</pl-hint>
-<pl-hint level="2">Enter the direction as an angle.</pl-hint>
+<pl-multiple-choice answers-name="direction">
+  <!-- direction choices -->
+</pl-multiple-choice>
`;

const QUESTION_SERVER_PATCH = `diff --git a/questions/vectorField/server.py b/questions/vectorField/server.py
index f14ff70..e013c23 100644
--- a/questions/vectorField/server.py
+++ b/questions/vectorField/server.py
@@ -18,5 +18,5 @@ def generate(data):
     fx = 2 * x - y
     fy = x + 3 * y
-    magnitude = math.sqrt(fx**2 + fy**2)
-    ux = fx / magnitude
-    uy = fy / magnitude
+    data['params']['fx'] = fx
+    data['params']['fy'] = fy
+    data['correct_answers']['direction'] = direction(fx, fy)
@@ -42,4 +42,1 @@ def grade(data):
 def grade(data):
-    grade_vector_length(data)
-    grade_normalization(data)
-    grade_direction(data)
`;

const DIFF_FILES = [
  {
    path: 'questions/vectorField/question.html',
    additions: 6,
    deletions: 5,
    patch: QUESTION_HTML_PATCH,
  },
  {
    path: 'questions/vectorField/server.py',
    additions: 3,
    deletions: 6,
    patch: QUESTION_SERVER_PATCH,
  },
] as const;

export function CourseAgentPanelMockup() {
  const [open, setOpen] = useState(true);
  const [selectedChat, setSelectedChat] = useState(CHAT_TITLES[0]);
  const [approvalMode, setApprovalMode] = useState<'ask' | 'always'>('ask');
  const [statisticsModalOpen, setStatisticsModalOpen] = useState(false);

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
            <ToolCallGroup count={4}>
              <CompletedToolCall>Set up the course sandbox</CompletedToolCall>
              <CompletedToolCall>
                Read <code>courseInstances/Fa26</code>
              </CompletedToolCall>
              <CompletedToolCall>Prepared a Fall 2027 course instance</CompletedToolCall>
              <CompletedToolCall>Validated the proposed course changes</CompletedToolCall>
            </ToolCallGroup>
            <div className="course-agent-accepted-approval border rounded px-2 py-2 small">
              <div className="d-flex align-items-center gap-2 fw-semibold text-success">
                <i className="bi bi-shield-check" aria-hidden="true" /> Approval accepted
              </div>
              <div className="mt-1">
                Created <code>courseInstances/Fa27</code> from Fall 2026.
              </div>
            </div>
            <p className="mb-0">
              Fall 2027 was created with the Fall 2026 assessments and settings. I updated its
              dates, short name, and display name, and the course validated successfully.
            </p>
          </AgentMessage>

          <UserMessage>
            Next, make <code>vectorField</code> easier by showing the evaluated field components at
            the point and asking students only to choose and justify the direction.
          </UserMessage>
          <AgentMessage>
            <ToolCallGroup count={3}>
              <CompletedToolCall>
                Read <code>questions/vectorField/question.html</code>
              </CompletedToolCall>
              <CompletedToolCall>
                Read <code>questions/vectorField/server.py</code>
              </CompletedToolCall>
              <CompletedToolCall>Prepared and validated the question edits</CompletedToolCall>
            </ToolCallGroup>
            <p className="mb-0">I prepared the following changes for your approval.</p>
            <DiffApproval />
          </AgentMessage>
        </div>

        <footer className="course-agent-footer border-top bg-white p-3">
          <Form onSubmit={(event) => event.preventDefault()}>
            <Form.Control
              as="textarea"
              rows={2}
              className="course-agent-chat-input shadow-none"
              aria-label="Message course agent"
              placeholder="Ask anything about your course…"
              defaultValue=""
            />
            <div className="course-agent-controls d-flex align-items-center gap-2 mt-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary text-nowrap"
                aria-label="View cost statistics"
                onClick={() => setStatisticsModalOpen(true)}
              >
                <i className="bi bi-bar-chart me-1" aria-hidden="true" /> $0.08
              </button>
              <button
                type="button"
                className="course-agent-approval-mode btn btn-sm btn-outline-primary text-nowrap"
                onClick={() => setApprovalMode(approvalMode === 'ask' ? 'always' : 'ask')}
              >
                {approvalMode === 'ask' ? 'Ask for approval' : 'Always approve'}
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
        </footer>
      </div>

      <Modal
        size="sm"
        show={statisticsModalOpen}
        centered
        onHide={() => setStatisticsModalOpen(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">Statistics</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <dl className="course-agent-statistics mb-0">
            <StatisticsRow label="Model" value={COURSE_AGENT_MODEL} />
            <StatisticsRow label="Input tokens" value="8,432" />
            <StatisticsRow label="Cached input tokens" value="6,144" />
            <StatisticsRow label="Output tokens" value="1,284" />
            <StatisticsRow label="Cached output tokens" value="0" />
            <StatisticsRow label="Total cost" value="$0.08" emphasis />
          </dl>
        </Modal.Body>
      </Modal>
    </aside>
  );
}

CourseAgentPanelMockup.displayName = 'CourseAgentPanelMockup';

function StatisticsRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="d-flex align-items-baseline justify-content-between gap-3 border-bottom py-2">
      <dt className="text-muted fw-normal">{label}</dt>
      <dd className={`mb-0 text-end ${emphasis ? 'fw-semibold' : ''}`}>{value}</dd>
    </div>
  );
}

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

function ToolCallGroup({ count, children }: { count: number; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="course-agent-tool-group">
      <button
        type="button"
        className="course-agent-tool-group-toggle btn btn-sm d-flex align-items-center gap-2 border-0 px-0 py-1 text-muted"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex-grow-1 text-start">
          Made {count} tool {count === 1 ? 'call' : 'calls'}
        </span>
        <i
          className={`course-agent-tool-group-chevron bi bi-chevron-${expanded ? 'down' : 'up'}`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="d-flex flex-column gap-1 border-start ms-2 mt-1 ps-3 py-1">{children}</div>
      )}
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

      <div className="course-agent-diff-files d-flex flex-column gap-2 p-2">
        {DIFF_FILES.map((file) => (
          <DiffFile key={file.path} {...file} />
        ))}
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
  patch,
}: {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasCollapsedContent, setHasCollapsedContent] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    const updateCollapsedContent = () => {
      if (!expanded) {
        setHasCollapsedContent(body.scrollHeight > body.clientHeight + 1);
      }
    };

    // Pierre renders inside a custom element, so observe its size before enabling expansion.
    const resizeObserver = new ResizeObserver(updateCollapsedContent);
    resizeObserver.observe(body);
    const diff = body.querySelector('diffs-container');
    if (diff) resizeObserver.observe(diff);

    return () => resizeObserver.disconnect();
  }, [expanded]);

  return (
    <div
      className={`course-agent-diff-file overflow-hidden rounded border ${expanded ? 'course-agent-diff-file-expanded' : ''}`}
    >
      <DiffFileHeader path={path} additions={additions} deletions={deletions} />
      <div ref={bodyRef} className="course-agent-diff-body border-top">
        <PatchDiff patch={patch} options={DIFF_OPTIONS} renderCustomHeader={() => null} />
      </div>
      <button
        type="button"
        className="course-agent-diff-expand btn btn-light d-flex w-100 align-items-center justify-content-center gap-2 rounded-0 border-0 border-top py-2 text-secondary"
        aria-expanded={expanded}
        disabled={!expanded && !hasCollapsedContent}
        onClick={() => setExpanded(!expanded)}
      >
        <span>{expanded ? 'Collapse' : 'Expand'}</span>
        <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} aria-hidden="true" />
      </button>
    </div>
  );
}

function DiffFileHeader({
  path,
  additions,
  deletions,
}: {
  path: string;
  additions: number;
  deletions: number;
}) {
  return (
    <div className="course-agent-diff-file-header d-flex align-items-center gap-2">
      <button
        type="button"
        className="course-agent-diff-file-link btn btn-link d-flex min-width-0 flex-grow-1 align-items-center gap-2 p-0 text-start text-decoration-none"
        aria-label={`Open ${path}`}
      >
        <i className="bi bi-file-earmark-code flex-shrink-0" aria-hidden="true" />
        <code className="text-primary text-truncate">{path}</code>
      </button>
      <span className="text-success">+{additions}</span>
      <span className="text-danger">−{deletions}</span>
    </div>
  );
}
