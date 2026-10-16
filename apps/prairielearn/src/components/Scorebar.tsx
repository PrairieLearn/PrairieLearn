import clsx from 'clsx';

import { renderHtml } from '@prairielearn/react';

function formatPendingScore(score: number) {
  return score < 0.1 ? '<0.1' : String(Math.round(score * 10) / 10);
}

export function PendingScoreIndicator({
  scorePending,
  gradingPending,
}: {
  scorePending: number;
  gradingPending: boolean;
}) {
  if (!gradingPending) return null;
  return (
    <details className="small text-start text-wrap mt-1">
      <summary className="text-info-emphasis">
        {scorePending > 0
          ? `Up to ${formatPendingScore(scorePending)}% pending`
          : 'Grading pending'}
      </summary>
      <div className="text-body-secondary mt-1">
        Submitted work is awaiting grading.
        {scorePending > 0 && (
          <> It could add up to {formatPendingScore(scorePending)} percentage points.</>
        )}
        {scorePending <= 0 && ' The score may change after grading.'}
      </div>
    </details>
  );
}

export function Scorebar({
  score,
  scorePending = 0,
  gradingPending = scorePending > 0,
  className = '',
  minWidth = '5em',
  maxWidth = '20em',
}: {
  score: number | null;
  scorePending?: number;
  gradingPending?: boolean;
  minWidth?: string;
  maxWidth?: string;
  className?: string;
}) {
  if (score == null) return null;
  const earnedWidth = Math.max(0, Math.min(100, score));
  const pendingWidth = Math.max(0, Math.min(100 - earnedWidth, scorePending));
  const label = gradingPending && score === 0 ? 'Pending' : `${Math.floor(score)}%`;
  const description = `Current score: ${score}%.${gradingPending ? ' Submitted work is awaiting grading.' : ''}${scorePending > 0 ? ` Up to ${formatPendingScore(scorePending)} percentage points pending.` : ''}`;
  return (
    <div className={className} style={{ minWidth, maxWidth }} data-testid="scorebar">
      <div
        className={clsx(
          'progress border position-relative',
          gradingPending ? 'border-info' : 'border-success',
        )}
        role="img"
        aria-label={description}
      >
        <div
          className="progress-bar bg-success"
          style={{ width: `${earnedWidth}%` }}
          aria-hidden="true"
        >
          {earnedWidth >= 50 ? label : ''}
        </div>
        <div
          className="position-relative d-flex align-items-center justify-content-center text-body"
          style={{ width: `${100 - earnedWidth}%` }}
          aria-hidden="true"
        >
          <div
            className="progress-bar bg-info progress-bar-striped position-absolute top-0 start-0 h-100"
            style={{
              width: `${earnedWidth < 100 ? (pendingWidth / (100 - earnedWidth)) * 100 : 0}%`,
            }}
          />
          <span className="position-relative">{earnedWidth < 50 ? label : ''}</span>
        </div>
      </div>
      <PendingScoreIndicator scorePending={scorePending} gradingPending={gradingPending} />
    </div>
  );
}

export function ScorebarHtml(
  score: number | null,
  {
    minWidth = '5em',
    maxWidth = '20em',
    classes = '',
    scorePending = 0,
    gradingPending = scorePending > 0,
  }: {
    minWidth?: string;
    maxWidth?: string;
    classes?: string;
    scorePending?: number;
    gradingPending?: boolean;
  } = {},
) {
  return renderHtml(
    <Scorebar
      score={score}
      scorePending={scorePending}
      gradingPending={gradingPending}
      className={classes}
      minWidth={minWidth}
      maxWidth={maxWidth}
    />,
  );
}
