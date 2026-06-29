import { type AppError, AppErrorAlert, syncJobFailedRenderer } from '../../../lib/client/errors.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

type BulkQuestionError = QuestionsError[
  | 'AddToAssessment'
  | 'RemoveFromAssessment'
  | 'ChangeTopic'
  | 'AddTags'
  | 'RemoveTags'
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
        INVALID_TOPIC: ({ topic }) => `Invalid topic: ${topic}`,
        INVALID_TAGS: ({ tags }) =>
          tags.length === 1 ? `Invalid tag: ${tags[0]}` : `Invalid tags: ${tags.join(', ')}`,
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
        UNKNOWN: ({ message }) => message,
      }}
    />
  );
}
