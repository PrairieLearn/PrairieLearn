import { useQuery } from '@tanstack/react-query';

import { useTRPC } from '../../../../trpc/assessmentQuestion/context.js';

export function FirstGradedSubmissionLink({
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
    <a
      href={`${manualGradingUrlPrefix}/instance_question/${data.instance_question_id}`}
      className="text-decoration-none"
      target="_blank"
      rel="noreferrer"
    >
      View first AI graded submission{' '}
      <i className="bi bi-box-arrow-up-right" style={{ fontSize: '0.7em' }} />
    </a>
  );
}
