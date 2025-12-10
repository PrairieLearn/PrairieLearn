import clsx from 'clsx';

import { renderHtml } from '@prairielearn/preact';

import { ansiToHtml } from '../lib/chalk.js';

export function SyncProblemButton({ output, type }: { output: string; type: 'error' | 'warning' }) {
  const title = type === 'error' ? 'Sync Errors' : 'Sync Warnings';

  const popoverContent = (
    <pre
      class="text-white rounded p-3 mb-0"
      style="background-color: black;"
      // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{ __html: ansiToHtml(output) }}
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
      data-bs-content={renderHtml(popoverContent).toString()}
      data-bs-custom-class="popover-wide"
    >
      <i
        class={clsx({
          fa: true,
          'fa-times text-danger': type === 'error',
          'fa-exclamation-triangle text-warning': type === 'warning',
        })}
        aria-hidden="true"
      />
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
