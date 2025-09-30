import clsx from 'clsx';

import { renderHtml } from '@prairielearn/preact';

export function Scorebar({
  score,
  class: className = '',
  minWidth = '5em',
  maxWidth = '20em',
}: {
  score: number | null;
  minWidth?: string;
  maxWidth?: string;
  class: string;
}) {
  if (score == null) return '';
  return (
    <div
      class={clsx('progress', 'border', 'border-success', className)}
      style={{ minWidth, maxWidth }}
    >
      <div
        class="progress-bar bg-success"
        style={{ width: `${Math.floor(Math.min(100, score))}%` }}
      >
        {score >= 50 ? `${Math.floor(score)}%` : ''}
      </div>
      <div
        class="d-flex flex-column justify-content-center text-center"
        style={{ width: `${100 - Math.floor(Math.min(100, score))}%` }}
      >
        {score >= 50 ? '' : `${Math.floor(score)}%`}
      </div>
    </div>
  );
}

export function ScorebarHtml(
  score: number | null,
  {
    minWidth = '5em',
    maxWidth = '20em',
    classes = '',
  }: { minWidth?: string; maxWidth?: string; classes?: string } = {},
) {
  return renderHtml(
    <Scorebar score={score} class={classes} minWidth={minWidth} maxWidth={maxWidth} />,
  );
}
