import { formatPoints, formatPointsOrList } from '../lib/format.js';

export function ExamQuestionAvailablePoints({
  open,
  pointsList,
  currentWeight,
  highestSubmissionScore,
}: {
  open: boolean;
  pointsList?: number[] | null;
  currentWeight: number;
  highestSubmissionScore?: number | null;
}) {
  if (!open || pointsList == null || pointsList.length === 0) {
    return <>&mdash;</>;
  }

  const bestScore = Math.floor((highestSubmissionScore ?? 0) * 100);

  const popoverContent = [
    `<p>You have ${pointsList.length} remaining attempt${pointsList.length !== 1 ? 's' : ''} for this question.</p>`,
    `<p>If you score 100% on your next submission, then you will be awarded an additional ${formatPoints(pointsList[0])} points.</p>`,
    bestScore > 0
      ? `<p>If you score less than ${bestScore}% on your next submission, then you will be awarded no additional points, but you will keep any awarded points that you already have.</p>` +
        `<p class="mb-0">If you score between ${bestScore}% and 100% on your next submission, then you will be awarded an additional <code>(${formatPoints(currentWeight)} * (score - ${bestScore})/100)</code> points.</p>`
      : `<p class="mb-0">If you score less than 100% on your next submission, then you will be awarded an additional <code>(${formatPoints(currentWeight)} * score / 100)</code> points.</p>`,
  ].join('');

  return (
    <>
      {pointsList.length === 1 ? (
        formatPoints(pointsList[0])
      ) : (
        <>
          {formatPoints(pointsList[0])},{' '}
          <span className="text-muted">{formatPointsOrList(pointsList.slice(1))}</span>
        </>
      )}
      <button
        type="button"
        className="btn btn-xs btn-ghost js-available-points-popover"
        aria-label="Explanation of available points"
        data-bs-toggle="popover"
        data-bs-container="body"
        data-bs-html="true"
        data-bs-title="Explanation of available points"
        data-bs-content={popoverContent}
        data-bs-placement="auto"
      >
        <i className="bi bi-question-circle" aria-hidden="true" />
      </button>
    </>
  );
}
