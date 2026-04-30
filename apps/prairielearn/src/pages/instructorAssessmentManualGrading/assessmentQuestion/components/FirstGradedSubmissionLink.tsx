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
      <div className="d-flex flex-wrap align-items-center gap-2 gap-lg-3">
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <i className="bi bi-stars fs-5" aria-hidden="true" />
          <strong>
            <a
              href={`${manualGradingUrlPrefix}/instance_question/${data.instance_question_id}`}
              target="_blank"
              rel="noreferrer"
              className="alert-link"
            >
              Review your submissions
            </a>
          </strong>
        </div>
        <span className="small text-body-secondary">
          Ensure you're satisfied with the AI gradings.
        </span>
      </div>
    </Alert>
  );
}
