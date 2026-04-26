import { useQuery } from '@tanstack/react-query';
import { Alert } from 'react-bootstrap';

import { useTRPC } from '../../../../trpc/assessmentQuestion/context.js';

export function ReviewSubmissionsAlert({
  jobSequenceId,
  manualGradingUrlPrefix,
}: {
  jobSequenceId: string;
  manualGradingUrlPrefix: string;
}) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.manualGrading.firstAiGradedInstanceQuestion.queryOptions({
      job_sequence_id: jobSequenceId,
    }),
  );

  if (!data?.instance_question_id) return null;

  return (
    <Alert variant="info" className="mb-3">
      <i className="bi bi-info-circle-fill me-2" aria-hidden="true" />
      <a
        href={`${manualGradingUrlPrefix}/instance_question/${data.instance_question_id}`}
        target="_blank"
        rel="noreferrer"
      >
        Review your submissions
      </a>
      .
    </Alert>
  );
}
