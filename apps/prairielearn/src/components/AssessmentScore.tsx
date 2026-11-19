import clsx from 'clsx';
import { Button } from 'react-bootstrap';

import { renderHtml } from '@prairielearn/react';

import type { GradingPending } from '../models/assessment-instance.js';

import { Scorebar } from './Scorebar.js';

interface AssessmentScoreProps {
  score: number | null;
  gradingPending: GradingPending | null;
  /**
   * Whether the student can currently work on the assessment, or `null` if
   * that is not known where the score is shown.
   */
  active: boolean | null;
  className?: string;
}

function savedAnswersMessage({ assessment_type, open }: GradingPending, active: boolean | null) {
  if (!open) return 'Some saved answers were not graded.';
  // Homework instances stay open after the homework can no longer be worked
  // on, so only tell the student what to do when they can still do it.
  if (!active) return 'Some saved answers have not been graded.';
  // Homework answers are only graded when the student asks; exams grade
  // whatever is saved when the student finishes.
  return assessment_type === 'Homework'
    ? 'You have saved answers that you have not submitted for grading.'
    : 'Your saved answers will be graded when you finish the assessment.';
}

export function AssessmentScore({
  score,
  gradingPending,
  active,
  className,
}: AssessmentScoreProps) {
  if (!gradingPending) return <Scorebar score={score} className={className} />;
  return (
    <div className={clsx('text-center', className)} style={{ minWidth: '5em', maxWidth: '20em' }}>
      <Scorebar score={score} />
      <Button
        variant="link"
        size="sm"
        className="mt-1 p-0 text-info-emphasis"
        style={{
          textDecorationStyle: 'dashed',
          textUnderlineOffset: '0.2em',
          minHeight: '24px',
        }}
        data-bs-toggle="popover"
        data-bs-animation="false"
        data-bs-container="body"
        data-bs-placement="auto"
        data-bs-title="Grading pending"
        data-bs-content={[
          gradingPending.manual ? 'Some answers are waiting for manual grading.' : null,
          gradingPending.grading ? 'Some answers are being graded.' : null,
          gradingPending.saved ? savedAnswersMessage(gradingPending, active) : null,
          'Your score may not reflect all submitted work.',
        ]
          .filter((sentence) => sentence != null)
          .join(' ')}
      >
        Grading pending
      </Button>
    </div>
  );
}

export function AssessmentScoreHtml(props: AssessmentScoreProps) {
  return renderHtml(<AssessmentScore {...props} />);
}
