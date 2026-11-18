import clsx from 'clsx';
import { Button } from 'react-bootstrap';

import { renderHtml } from '@prairielearn/react';

import type { GradingPending } from '../models/assessment-instance.js';

import { Scorebar } from './Scorebar.js';

interface AssessmentScoreProps {
  score: number | null;
  gradingPending: GradingPending | null;
  className?: string;
}

function savedAnswersMessage({ assessment_type, open }: GradingPending) {
  if (!open) return 'Some saved answers were not graded.';
  // Homework answers are only graded when the student asks; exams grade
  // whatever is saved when the student finishes.
  return assessment_type === 'Homework'
    ? 'You have saved answers that you have not submitted for grading.'
    : 'Your saved answers will be graded when you finish the assessment.';
}

export function AssessmentScore({ score, gradingPending, className }: AssessmentScoreProps) {
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
          gradingPending.saved ? savedAnswersMessage(gradingPending) : null,
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
