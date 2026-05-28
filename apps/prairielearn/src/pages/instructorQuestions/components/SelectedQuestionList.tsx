import { useMemo } from 'react';

import type { SafeQuestionsPageData } from '../../../components/QuestionsTable.shared.js';

const COLLAPSE_THRESHOLD = 5;

export function SelectedQuestionList({ questions }: { questions: SafeQuestionsPageData[] }) {
  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.qid.localeCompare(b.qid, undefined, { numeric: true })),
    [questions],
  );
  const heading = `${sortedQuestions.length} selected ${
    sortedQuestions.length === 1 ? 'question' : 'questions'
  }`;
  const listItems = (
    <ul className="list-group list-group-flush mt-2 mb-0">
      {sortedQuestions.map((question) => (
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
        </li>
      ))}
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
