import { renderHtml } from '../lib/preact-html.js';

export function ScorebarPreact({
  score,
  minWidth = '5em',
  maxWidth = '20em',
  classes = '',
}: {
  score: number | null;
  minWidth?: string;
  maxWidth?: string;
  classes?: string;
}) {
  if (score == null) return '';
  return (
    <div class={`progress border border-success ${classes}`} style={{ minWidth, maxWidth }}>
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

export function Scorebar(
  score: number | null,
  props?: Omit<Parameters<typeof ScorebarPreact>[0], 'score'>,
) {
  return renderHtml(<ScorebarPreact score={score} {...props} />);
}
