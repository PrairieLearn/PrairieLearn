import { type AppError, AppErrorAlert, syncJobFailedRenderer } from '../../../lib/client/errors.js';
import { blockerDescription } from '../../../lib/infoAssessment-edits.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

type BulkQuestionError = QuestionsError[
  | 'AddToAssessment'
  | 'RemoveFromAssessment'
  | 'DeleteQuestions'];

export function BulkQuestionErrorAlert({
  error,
  urlPrefix,
}: {
  error: AppError<BulkQuestionError> | null;
  urlPrefix: string;
}) {
  return (
    <AppErrorAlert
      error={error}
      className="mt-3 mb-0"
      render={{
        SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
        QUESTIONS_USED_IN_OTHER_COURSES: ({ message, qids }) => (
          <>
            {message}
            <ul className="mb-0 mt-2">
              {qids.map((qid) => (
                <li key={qid}>
                  <code>{qid}</code>
                </li>
              ))}
            </ul>
          </>
        ),
        DELETION_BREAKS_ASSESSMENTS: ({ blockedAssessments }) => (
          <>
            This deletion would leave the following assessments in an invalid state. Remove the
            questions from these assessments first, then try again.
            <ul className="mb-0 mt-2">
              {blockedAssessments.map((a) => (
                <li key={`${a.courseInstanceShortName}-${a.assessmentLabel}`}>
                  <strong>
                    {a.courseInstanceShortName}: {a.assessmentLabel}
                  </strong>{' '}
                  — {a.blockers.map(blockerDescription).join('; ')}
                </li>
              ))}
            </ul>
          </>
        ),
        UNKNOWN: ({ message }) => message,
      }}
    />
  );
}
