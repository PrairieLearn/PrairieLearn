import { renderHtml } from '@prairielearn/react';

import type { Job } from '../lib/db-types.js';

export function JobStatus({ status }: { status: Job['status'] }) {
  if (status === 'Running') {
    return <span className="badge text-bg-primary">Running</span>;
  } else if (status === 'Success') {
    return <span className="badge text-bg-success">Success</span>;
  } else if (status === 'Error') {
    return <span className="badge text-bg-danger">Error</span>;
  }

  return <span className="badge text-bg-secondary">Unknown</span>;
}

export function JobStatusHTML({ status }: { status: Job['status'] }) {
  return renderHtml(<JobStatus status={status} />);
}
