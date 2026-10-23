import clsx from 'clsx';
import { Button } from 'react-bootstrap';

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
        data-bs-content="Some answers have not been graded. Your score may not reflect all submitted work."
      >
        Grading pending
      </Button>
    </div>
  );
}

export function AssessmentScoreHtml(props: AssessmentScoreProps) {
  return renderHtml(<AssessmentScore {...props} />);
}
