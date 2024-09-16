import { html } from '@prairielearn/html';

import type { Job, JobSequence } from '../lib/db-types.js';

export function JobStatus({ status }: { status: Job['status'] | JobSequence['status'] }) {
  if (status === 'Running') {
    return html`<span class="badge badge-primary">Running</span>`;
  } else if (status === 'Success') {
    return html`<span class="badge badge-success">Success</span>`;
  } else if (status === 'Error') {
    return html`<span class="badge badge-danger">Error</span>`;
  }

  return html`<span class="badge badge-secondary">Unknown</span>`;
}
