import { type HtmlSafeString, html } from '@prairielearn/html';

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

// This is intentionally a separate `html` tagged-template implementation rather
// than a wrapper around the React `JobStatus` component. Using `renderHtml()` to
// wrap a React component is orders of magnitude slower than simple string
// interpolation, which matters on pages that render thousands of badges (e.g.,
/** the course syncs page). */
export function JobStatusHtml({ status }: { status: Job['status'] }): HtmlSafeString {
  if (status === 'Running') {
    return html`<span class="badge text-bg-primary">Running</span>`;
  } else if (status === 'Success') {
    return html`<span class="badge text-bg-success">Success</span>`;
  } else if (status === 'Error') {
    return html`<span class="badge text-bg-danger">Error</span>`;
  }

  return html`<span class="badge text-bg-secondary">Unknown</span>`;
}
