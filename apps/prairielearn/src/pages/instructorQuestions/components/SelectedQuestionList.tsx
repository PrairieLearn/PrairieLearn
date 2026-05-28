import { Badge } from 'react-bootstrap';

import type { SafeQuestionsPageData } from '../../../components/QuestionsTable.shared.js';

const COLLAPSE_THRESHOLD = 5;

/**
 * One place where a question appears in a synced assessment, annotated with
 * whether the zone would become empty if the question were removed.
 */
export interface QuestionZoneMembership {
  assessmentId: string;
  assessmentLabel: string;
  courseInstanceShortName: string;
  zoneIndex: number;
  zoneTitle: string | null;
  wouldEmptyZone: boolean;
}

function ZoneMembershipList({ memberships }: { memberships: QuestionZoneMembership[] }) {
  if (memberships.length === 0) return null;
  return (
    <ul className="list-unstyled mb-0 mt-1 small">
      {memberships.map((membership) => (
        <li
          key={`${membership.assessmentId}-${membership.zoneIndex}`}
          className="d-flex flex-wrap align-items-center gap-1"
        >
          <span className="text-muted">
            {membership.courseInstanceShortName}: {membership.assessmentLabel} —{' '}
            {membership.zoneTitle
              ? `"${membership.zoneTitle}"`
              : `zone ${membership.zoneIndex + 1}`}
          </span>
          {membership.wouldEmptyZone && (
            <Badge bg="warning" text="dark">
              Zone will be removed
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SelectedQuestionList({
  questions,
  zoneMembershipsByQid,
}: {
  questions: SafeQuestionsPageData[];
  zoneMembershipsByQid?: Map<string, QuestionZoneMembership[]>;
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
        const memberships = zoneMembershipsByQid?.get(question.qid) ?? [];
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
            <ZoneMembershipList memberships={memberships} />
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
