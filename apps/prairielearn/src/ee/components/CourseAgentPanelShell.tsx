import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { type ReactNode, useState, useSyncExternalStore } from 'react';
import { Alert, Spinner } from 'react-bootstrap';

import { useTRPC } from '../../trpc/course/context.js';

const subscribe = () => () => {};

export function CourseAgentPanelShell({
  initialOpen,
  loading = false,
  children,
}: {
  initialOpen: boolean;
  loading?: boolean;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const settings = useMutation(trpc.courseAgent.settings.mutationOptions());
  const [open, setOpen] = useState(initialOpen);
  const [closing, setClosing] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  function changeOpen(expanded: boolean) {
    settings.mutate({ expanded });
    if (
      !expanded &&
      !window.matchMedia('(min-width: 1200px), (prefers-reduced-motion: reduce)').matches
    ) {
      setClosing(true);
    } else {
      setClosing(false);
      setOpen(expanded);
    }
  }

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
          onClick={() => changeOpen(true)}
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
            setOpen(false);
            setClosing(false);
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
              onClick={() => changeOpen(false)}
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
              onClick={() => changeOpen(false)}
            />
          </div>
          {settings.isError && (
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

export function CourseAgentPanelLoading() {
  return (
    <div
      role="status"
      className="d-flex align-items-center justify-content-center gap-2 text-muted p-4"
    >
      <Spinner size="sm" /> Loading conversation…
    </div>
  );
}
