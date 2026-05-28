import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import { type AppError, AppErrorAlert, syncJobFailedRenderer } from '../../../lib/client/errors.js';
import { type BlockedAssessment, blockerDescription } from '../../../lib/infoAssessment-edits.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

type BulkQuestionError = QuestionsError['DeleteQuestions'];

interface BlockedAssessmentGroup {
  courseInstanceId: string;
  courseInstanceShortName: string;
  assessments: BlockedAssessment[];
}

/** Groups blocked assessments by course instance, preserving first-seen order. */
function groupByCourseInstance(blockedAssessments: BlockedAssessment[]): BlockedAssessmentGroup[] {
  const groups = new Map<string, BlockedAssessmentGroup>();
  for (const assessment of blockedAssessments) {
    const group = groups.get(assessment.courseInstanceId);
    if (group) {
      group.assessments.push(assessment);
    } else {
      groups.set(assessment.courseInstanceId, {
        courseInstanceId: assessment.courseInstanceId,
        courseInstanceShortName: assessment.courseInstanceShortName,
        assessments: [assessment],
      });
    }
  }
  return [...groups.values()];
}

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
            {groupByCourseInstance(blockedAssessments).map((group) => (
              <div key={group.courseInstanceId} className="mt-2">
                <div className="text-muted small">{group.courseInstanceShortName}:</div>
                <ul className="list-unstyled mb-0 mt-1">
                  {group.assessments.map((a) => (
                    <li
                      key={a.assessmentId}
                      className="d-flex flex-wrap align-items-center gap-2 mt-1"
                    >
                      <AssessmentBadge
                        courseInstanceId={a.courseInstanceId}
                        assessment={{
                          assessment_id: a.assessmentId,
                          color: a.assessmentColor,
                          label: a.assessmentLabel,
                        }}
                      />
                      <span>{a.blockers.map(blockerDescription).join('; ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        ),
        UNKNOWN: ({ message }) => message,
      }}
    />
  );
}
