import { formatPoints } from '../../../lib/format.js';

import type { ClientQuestionRow } from './types.js';

export function InstanceQuestionPoints({
  row,
  component,
}: {
  row: ClientQuestionRow;
  component: 'manual' | 'auto' | 'total';
}) {
  const points =
    component === 'auto' ? row.autoPoints : component === 'manual' ? row.manualPoints : row.points;
  const maxPoints =
    component === 'auto'
      ? row.maxAutoPoints
      : component === 'manual'
        ? row.maxManualPoints
        : row.maxPoints;
  const pointsPending =
    (['saved', 'grading'].includes(row.status ?? '') && component !== 'manual') ||
    (row.requiresManualGrading && component !== 'auto');

  // Special case: if this is a manually-graded question in the saved state, don't show
  // a "pending" badge for auto points, since there aren't any pending auto points.
  if (row.status === 'saved' && component === 'auto' && !row.maxAutoPoints && row.maxManualPoints) {
    return <span className="text-nowrap">&mdash;</span>;
  }

  const pointsContent =
    // If the question is unanswered show a dash instead of 0 points, unless
    // the question was manually graded or a regrading process forced the
    // points to be increased.
    row.status === 'unanswered' && !row.hasLastGrader && row.points === 0 ? (
      <>&mdash;</>
    ) : pointsPending ? (
      <span className="badge text-bg-info">pending</span>
    ) : !points && !maxPoints ? (
      <>&mdash;</>
    ) : (
      <span data-testid="awarded-points">{formatPoints(points)}</span>
    );

  return (
    <span className="text-nowrap">
      {pointsContent}
      {maxPoints ? (
        <small>
          /<span className="text-muted">{maxPoints}</span>
        </small>
      ) : null}
    </span>
  );
}
