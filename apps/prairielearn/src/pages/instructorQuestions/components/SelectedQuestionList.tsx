import type { SafeQuestionsPageData } from '../../../components/QuestionsTable.shared.js';
import { AssessmentBadges } from '../../instructorAssessmentQuestions/components/AssessmentBadges.js';
import type { AssessmentForPicker } from '../../instructorAssessmentQuestions/types.js';

const COLLAPSE_THRESHOLD = 5;

/**
 * Assessments that reference a question, grouped by course instance, with the
 * subset of assessment IDs whose zones would be emptied by the deletion.
 */
export interface QuestionCourseInstanceMembership {
  courseInstanceId: string;
  courseInstanceShortName: string;
  assessments: AssessmentForPicker[];
  emptiedAssessmentIds: ReadonlySet<string>;
}

function CourseInstanceMemberships({
  memberships,
}: {
  memberships: QuestionCourseInstanceMembership[];
}) {
  if (memberships.length === 0) return null;
  return (
    <div className="mt-1">
      {memberships.map((membership) => (
        <div
          key={membership.courseInstanceId}
          className="d-flex flex-wrap align-items-center gap-2 mt-1"
        >
          <span className="text-muted small">{membership.courseInstanceShortName}:</span>
          <div className="d-flex flex-wrap align-items-center">
            <AssessmentBadges
              assessments={membership.assessments}
              courseInstanceId={membership.courseInstanceId}
              markedAssessmentIds={membership.emptiedAssessmentIds}
              stopGroupClickPropagation={false}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SelectedQuestionList({
  questions,
  membershipsByQid,
}: {
  questions: SafeQuestionsPageData[];
  membershipsByQid?: Map<string, QuestionCourseInstanceMembership[]>;
}) {
  const sortedQuestions = [...questions].sort((a, b) =>
    a.qid.localeCompare(b.qid, undefined, { numeric: true }),
  );
  const heading = `${sortedQuestions.length} selected ${
    sortedQuestions.length === 1 ? 'question' : 'questions'
  }`;
  const listItems = (
    <ul className="list-group list-group-flush mt-2 mb-0">
      {sortedQuestions.map((question) => {
        const memberships = membershipsByQid?.get(question.qid) ?? [];
        return (
          <li key={question.id} className="list-group-item">
            {question.title ? (
              <>
                <div className="text-truncate">{question.title}</div>
                <div
                  className="text-muted font-monospace text-truncate"
                  style={{ fontSize: '0.75rem' }}
                >
                  {question.qid}
                </div>
              </>
            ) : (
              <div className="font-monospace text-truncate">{question.qid}</div>
            )}
            <CourseInstanceMemberships memberships={memberships} />
          </li>
        );
      })}
    </ul>
  );

  if (sortedQuestions.length > COLLAPSE_THRESHOLD) {
    return (
      <details>
        <summary className="fw-semibold small">{heading}</summary>
        {listItems}
      </details>
    );
  }

  return (
    <div>
      <h6 className="fw-semibold small mb-0">{heading}</h6>
      {listItems}
    </div>
  );
}
