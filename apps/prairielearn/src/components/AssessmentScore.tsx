import clsx from 'clsx';
import { Button } from 'react-bootstrap';

import { renderHtml } from '@prairielearn/react';

import type { GradingPending } from '../models/assessment-instance.js';

import { Scorebar } from './Scorebar.js';

interface AssessmentScoreProps {
  score: number | null;
  gradingPending: GradingPending | null;
  /** Whether the student can currently work on the assessment. */
  active: boolean;
  className?: string;
}

function savedAnswersMessage({ assessment_type }: GradingPending) {
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
  // A saved answer only counts while the student can still have it graded.
  // Homework instances stay open after the homework can no longer be worked
  // on, and nothing will ever grade those answers.
  const saved = gradingPending?.saved && gradingPending.open && active;
  if (!gradingPending || !(gradingPending.manual || gradingPending.grading || saved)) {
    return <Scorebar score={score} className={className} />;
  }
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
          saved ? savedAnswersMessage(gradingPending) : null,
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
