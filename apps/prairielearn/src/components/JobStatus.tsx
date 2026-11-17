import { type HtmlSafeString, html } from '@prairielearn/html';
import { assertNever } from '@prairielearn/utils';

import type { Job } from '../lib/db-types.js';

export function JobStatus({ status }: { status: Job['status'] }) {
  if (status == null) return <span className="badge text-bg-secondary">Unknown</span>;
  switch (status) {
    case 'Running':
      return <span className="badge text-bg-primary">Running</span>;
    case 'Stopping':
      return <span className="badge text-bg-warning">Stopping</span>;
    case 'Stopped':
      return <span className="badge text-bg-secondary">Stopped</span>;
    case 'Success':
      return <span className="badge text-bg-success">Success</span>;
    case 'Error':
      return <span className="badge text-bg-danger">Error</span>;
    default:
      assertNever(status);
  }
}

// This is intentionally a separate `html` tagged-template implementation rather
// than a wrapper around the React `JobStatus` component. Using `renderHtml()` to
// wrap a React component is orders of magnitude slower than simple string
// interpolation, which matters on pages that render thousands of badges (e.g.,
// the course syncs page).

export function JobStatusHtml({ status }: { status: Job['status'] }): HtmlSafeString {
  if (status == null) return html`<span class="badge text-bg-secondary">Unknown</span>`;
  switch (status) {
    case 'Running':
      return html`<span class="badge text-bg-primary">Running</span>`;
    case 'Stopping':
      return html`<span class="badge text-bg-warning">Stopping</span>`;
    case 'Stopped':
      return html`<span class="badge text-bg-secondary">Stopped</span>`;
    case 'Success':
      return html`<span class="badge text-bg-success">Success</span>`;
    case 'Error':
      return html`<span class="badge text-bg-danger">Error</span>`;
    default:
      assertNever(status);
  }
}
