import type { PendingRegradeQuestion } from '../instructorAssessmentInstances.types.js';

const COLLAPSE_THRESHOLD = 5;

export function PendingRegradeQuestionList({ questions }: { questions: PendingRegradeQuestion[] }) {
  const heading = `${questions.length} ${
    questions.length === 1 ? 'question' : 'questions'
  } will be set to full credit`;
  const listItems = (
    <ul className="list-group list-group-flush mt-2 mb-0">
      {questions.map((question) => (
        <li key={question.id} className="list-group-item px-0">
          {question.title ? (
            <>
              <div className="text-truncate">{question.title}</div>
              <div className="text-muted font-monospace text-truncate small">{question.qid}</div>
            </>
          ) : (
            <div className="font-monospace text-truncate">{question.qid}</div>
          )}
          <div className="text-muted small">
            {question.instance_count} {question.instance_count === 1 ? 'instance' : 'instances'}{' '}
            below maximum
          </div>
        </li>
      ))}
    </ul>
  );

  if (questions.length > COLLAPSE_THRESHOLD) {
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
