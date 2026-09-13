import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Alert, Spinner } from 'react-bootstrap';

export function CourseAgentPanelFrame({
  open,
  closing,
  hydrated,
  loading,
  settingsError,
  children,
  onOpenChange,
  onCloseTransitionEnd,
}: {
  open: boolean;
  closing: boolean;
  hydrated: boolean;
  loading: boolean;
  settingsError: boolean;
  children: ReactNode;
  onOpenChange: (expanded: boolean) => void;
  onCloseTransitionEnd: () => void;
}) {
  return (
    <aside
      className={clsx('course-agent-panel', {
        'course-agent-panel-open': open,
        'course-agent-panel-collapsed': !open,
        'course-agent-panel-closing': closing,
      })}
      aria-label="Course agent panel"
    >
      <div className="course-agent-panel-rail border-start bg-light">
        <button
          type="button"
          className="course-agent-launcher btn bg-primary-subtle text-primary border border-primary-subtle rounded-circle shadow-sm p-2"
          aria-label="Expand course agent"
          title="Expand course agent"
          disabled={!hydrated}
          onClick={() => onOpenChange(true)}
        >
          {hydrated && !loading ? (
            <i className="bi bi-stars fs-5" aria-hidden="true" />
          ) : (
            <Spinner size="sm" aria-label="Loading course agent" />
          )}
        </button>
      </div>
      <div
        className="course-agent-panel-content border-start bg-light"
        onTransitionEnd={(event) => {
          if (closing && event.target === event.currentTarget && event.propertyName === 'opacity') {
            onCloseTransitionEnd();
          }
        }}
      >
        <header className="course-agent-header border-bottom bg-white px-3 py-3">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-light me-1 d-none d-xl-inline-flex"
              aria-label="Collapse course agent"
              disabled={!hydrated}
              onClick={() => onOpenChange(false)}
            >
              <i className="bi bi-arrow-bar-right" aria-hidden="true" />
            </button>
            <strong className="d-flex align-items-center gap-2">
              <i className="bi bi-stars text-primary" aria-hidden="true" /> Course agent
            </strong>
            <button
              type="button"
              className="btn-close ms-auto d-xl-none"
              aria-label="Close course agent"
              disabled={!hydrated}
              onClick={() => onOpenChange(false)}
            />
          </div>
          {settingsError && (
            <Alert variant="warning" className="small mt-2 mb-0">
              Could not save your panel preference. Try opening or closing it again.
            </Alert>
          )}
        </header>
        {hydrated && !loading ? children : <CourseAgentPanelLoading />}
      </div>
    </aside>
  );
}

function CourseAgentPanelLoading() {
  return (
    <div
      role="status"
      className="d-flex align-items-center justify-content-center gap-2 text-muted p-4"
    >
      <Spinner size="sm" /> Loading conversation…
    </div>
  );
}
