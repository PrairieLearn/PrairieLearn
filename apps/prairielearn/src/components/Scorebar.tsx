import { renderHtml } from '../lib/preact-html.js';

export function Scorebar(
  {
    score,
    className,
    minWidth,
    maxWidth,
  }: {
    score: number | null;
    minWidth?: string;
    maxWidth?: string;
    className?: string;
  } = {
    score: null,
    className: '',
    minWidth: '5em',
    maxWidth: '20em',
  },
) {
  if (score == null) return '';
  return (
    <div class={`progress border border-success ${className}`} style={{ minWidth, maxWidth }}>
      <div
        className="progress-bar bg-success"
        style={{ width: `${Math.floor(Math.min(100, score))}%` }}
      >
        {score >= 50 ? `${Math.floor(score)}%` : ''}
      </div>
      <div
        className="d-flex flex-column justify-content-center text-center"
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
    <Scorebar score={score} className={classes} minWidth={minWidth} maxWidth={maxWidth} />,
  );
}
