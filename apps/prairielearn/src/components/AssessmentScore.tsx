import clsx from 'clsx';

import { renderHtml } from '@prairielearn/react';

import { Scorebar } from './Scorebar.js';

interface AssessmentScoreProps {
  score: number | null;
  gradingPending: boolean;
  className?: string;
}

export function AssessmentScore({ score, gradingPending, className }: AssessmentScoreProps) {
  if (!gradingPending) return <Scorebar score={score} className={className} />;
  return (
    <div className={clsx('text-center', className)} style={{ minWidth: '5em', maxWidth: '20em' }}>
      <div className="fw-semibold">Grading pending</div>
      {score != null && <div className="small text-muted">Current score: {Math.floor(score)}%</div>}
    </div>
  );
}

export function AssessmentScoreHtml(props: AssessmentScoreProps) {
  return renderHtml(<AssessmentScore {...props} />);
}
