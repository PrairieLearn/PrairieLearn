import { useState } from 'react';
import { Badge, Button, Form, Offcanvas } from 'react-bootstrap';

export function CourseAgentPanelMockup() {
  const [show, setShow] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  return (
    <>
      <Button
        className="position-fixed bottom-0 end-0 m-4 rounded-pill px-3 py-2 shadow"
        style={{ zIndex: 1035 }}
        aria-label="Open course agent"
        onClick={() => setShow(true)}
      >
        <i className="bi bi-stars me-2" />
        Ask course agent
      </Button>

      <Offcanvas
        show={show}
        placement="end"
        backdrop={false}
        className="border-start shadow-lg"
        style={{ width: 'min(460px, 100vw)' }}
        aria-label="Course agent panel"
        scroll
        onHide={() => setShow(false)}
      >
        <Offcanvas.Header className="border-bottom px-4 py-3" closeButton>
          <div className="d-flex flex-column gap-1">
            <div className="d-flex align-items-center gap-2">
              <span
                className="d-inline-flex align-items-center justify-content-center rounded-3 bg-primary text-white"
                style={{ width: 34, height: 34 }}
              >
                <i className="bi bi-stars" />
              </span>
              <div>
                <Offcanvas.Title className="fs-5">Course agent</Offcanvas.Title>
                <div className="d-flex align-items-center gap-2 small text-muted">
                  <span
                    className="d-inline-block rounded-circle bg-success"
                    style={{ width: 7, height: 7 }}
                  />
                  Ready
                  <Badge bg="light" text="dark" className="fw-normal border">
                    Prototype
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </Offcanvas.Header>

        <div className="d-flex align-items-center justify-content-between border-bottom bg-light px-4 py-2">
          <Button variant="link" size="sm" className="p-0 text-decoration-none">
            <i className="bi bi-plus-lg me-1" /> New chat
          </Button>
          <Form.Check
            type="switch"
            id="course-agent-diagnostics"
            className="small"
            label="Diagnostics"
            checked={showDiagnostics}
            onChange={(event) => setShowDiagnostics(event.currentTarget.checked)}
          />
        </div>

        <Offcanvas.Body className="d-flex flex-column p-0 overflow-hidden bg-body-tertiary">
          <div className="flex-grow-1 overflow-auto px-4 py-4">
            <div className="text-center small text-muted mb-4">Today</div>

            <div className="d-flex justify-content-end mb-4">
              <div
                className="rounded-4 rounded-bottom-end-1 bg-primary px-3 py-2 text-white"
                style={{ maxWidth: '84%' }}
              >
                Can you check Exam 1 and tell me which questions students struggled with most?
              </div>
            </div>

            <div className="d-flex align-items-start gap-2 mb-3">
              <span
                className="d-inline-flex flex-shrink-0 align-items-center justify-content-center rounded-circle bg-primary-subtle text-primary"
                style={{ width: 30, height: 30 }}
              >
                <i className="bi bi-stars small" />
              </span>
              <div style={{ maxWidth: '88%' }}>
                <div className="rounded-4 rounded-top-start-1 border bg-white px-3 py-3 shadow-sm">
                  <p className="mb-2">I reviewed Exam 1 across all 86 completed attempts.</p>
                  <p className="mb-2">The three questions with the lowest average scores were:</p>
                  <ol className="mb-2 ps-3">
                    <li>
                      <strong>Vector fields</strong> — 42%
                    </li>
                    <li>
                      <strong>Line integrals</strong> — 51%
                    </li>
                    <li>
                      <strong>Gradient interpretation</strong> — 58%
                    </li>
                  </ol>
                  <p className="mb-0">
                    Want me to inspect the question content and suggest revisions?
                  </p>
                </div>

                {showDiagnostics && (
                  <div className="mt-2 rounded-3 border bg-white p-3 small shadow-sm">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span
                        className="fw-semibold text-uppercase text-muted"
                        style={{ letterSpacing: '0.04em' }}
                      >
                        Run diagnostics
                      </span>
                      <span className="text-muted">4.8 s</span>
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <DiagnosticRow
                        icon="bi-database"
                        label="Queried assessment attempts"
                        detail="86 rows"
                      />
                      <DiagnosticRow
                        icon="bi-bar-chart"
                        label="Calculated question averages"
                        detail="12 questions"
                      />
                      <DiagnosticRow
                        icon="bi-check-circle"
                        label="Response completed"
                        detail="1,284 tokens"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-top bg-white p-3">
            <Form onSubmit={(event) => event.preventDefault()}>
              <div className="rounded-4 border bg-white p-2 shadow-sm focus-ring">
                <Form.Control
                  as="textarea"
                  rows={2}
                  className="border-0 shadow-none resize-none"
                  aria-label="Message course agent"
                  placeholder="Ask about your course…"
                  defaultValue=""
                />
                <div className="d-flex align-items-center justify-content-between px-1 pb-1">
                  <Button
                    variant="link"
                    size="sm"
                    className="text-muted p-1"
                    aria-label="Attach files"
                  >
                    <i className="bi bi-paperclip" />
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="rounded-circle"
                    aria-label="Send message"
                  >
                    <i className="bi bi-arrow-up" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 text-center small text-muted">
                Static UI prototype — messages are not sent or saved.
              </div>
            </Form>
          </div>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}

CourseAgentPanelMockup.displayName = 'CourseAgentPanelMockup';

function DiagnosticRow({ icon, label, detail }: { icon: string; label: string; detail: string }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <i className={`bi ${icon} text-success`} />
      <span className="flex-grow-1">{label}</span>
      <span className="text-muted">{detail}</span>
    </div>
  );
}
