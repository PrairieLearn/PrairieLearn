import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import { type AppError, AppErrorAlert, syncJobFailedRenderer } from '../../../lib/client/errors.js';
import { type BlockedAssessment, blockerDescription } from '../../../lib/infoAssessment-edits.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

type BulkQuestionError = QuestionsError['DeleteQuestions'];

/** Buckets items by a string key, returning `[key, items]` pairs in first-seen key order. */
function groupBy<T>(items: T[], keyOf: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(keyOf(item));
    if (group) {
      group.push(item);
    } else {
      groups.set(keyOf(item), [item]);
    }
  }
  return [...groups.entries()];
}

const reasonOf = (assessment: BlockedAssessment) =>
  assessment.blockers.map(blockerDescription).join('; ');

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
            {groupBy(blockedAssessments, (a) => a.courseInstanceId).map(
              ([courseInstanceId, assessments]) => (
                <div key={courseInstanceId} className="mt-2">
                  <div className="fw-semibold">{assessments[0].courseInstanceShortName}</div>
                  <ul className="list-unstyled mb-0 mt-1">
                    {groupBy(assessments, reasonOf).map(([reason, reasonAssessments]) => (
                      <li key={reason} className="d-flex flex-wrap align-items-center gap-2 mt-1">
                        {reasonAssessments.map((a) => (
                          <AssessmentBadge
                            key={a.assessmentId}
                            courseInstanceId={a.courseInstanceId}
                            assessment={{
                              assessment_id: a.assessmentId,
                              color: a.assessmentColor,
                              label: a.assessmentLabel,
                            }}
                          />
                        ))}
                        <span>— {reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </>
        ),
        UNKNOWN: ({ message }) => message,
      }}
    />
  );
}
