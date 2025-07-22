import clsx from 'clsx';

import { ansiToHtml } from '../lib/chalk.js';
import { renderHtml } from '../lib/preact-html.js';

export function SyncProblemButton({ output, type }: { output: string; type: 'error' | 'warning' }) {
  const title = type === 'error' ? 'Sync Errors' : 'Sync Warnings';
  const classes =
    type === 'error' ? 'fa-times text-danger' : 'fa-exclamation-triangle text-warning';

  const popoverContent = (
    <pre
      class="text-white rounded p-3 mb-0"
      style="background-color: black;"
      // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{ __html: ansiToHtml(output).toString() }}
    />
  );

  return (
    <button
      class="btn btn-xs btn-ghost me-1"
      type="button"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title={title}
      data-bs-content={popoverContent}
      data-bs-custom-class="popover-wide"
    >
      <i class={clsx('fa', classes)} aria-hidden="true" />
    </button>
  );
}

export function SyncProblemButtonHtml({
  output,
  type,
}: {
  output: string;
  type: 'error' | 'warning';
}) {
  return renderHtml(<SyncProblemButton output={output} type={type} />);
}
