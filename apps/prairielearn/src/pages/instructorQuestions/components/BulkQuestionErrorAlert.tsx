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
        DELETION_BREAKS_ASSESSMENTS: ({ blockedAssessments }) => {
          const assessmentsPlural = blockedAssessments.length !== 1;
          const questionsPlural =
            new Set(blockedAssessments.flatMap((a) => a.affectedQids)).size !== 1;
          return (
            <>
              This deletion would leave the following{' '}
              {assessmentsPlural ? 'assessments' : 'assessment'} in an invalid state. Remove the{' '}
              {questionsPlural ? 'questions' : 'question'} from {assessmentsPlural ? 'them' : 'it'}{' '}
              first, or skip {questionsPlural ? 'them' : 'it'} and delete the rest.
              {groupBy(blockedAssessments, (a) => a.courseInstanceId).map(
                ([courseInstanceId, assessments]) => (
                  <div key={courseInstanceId} className="mt-2">
                    <div className="fw-semibold">{assessments[0].courseInstanceShortName}</div>
                    <ul className="list-unstyled mb-0 mt-1">
                      {assessments.map((a) => (
                        <li key={a.assessmentId} className="mt-1">
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <AssessmentBadge
                              courseInstanceId={a.courseInstanceId}
                              assessment={{
                                assessment_id: a.assessmentId,
                                color: a.assessmentColor,
                                label: a.assessmentLabel,
                              }}
                            />
                            <span>— {reasonOf(a)}</span>
                          </div>
                          {a.affectedQids.length > 0 && (
                            <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
                              <span className="text-muted small me-1">
                                Selected {a.affectedQids.length === 1 ? 'question' : 'questions'} in
                                this assessment:
                              </span>
                              {a.affectedQids.map((qid) => (
                                <code key={qid}>{qid}</code>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}
            </>
          );
        },
        UNKNOWN: ({ message }) => message,
      }}
    />
  );
}
