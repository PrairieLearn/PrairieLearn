export function ExamFooterContent({
  someQuestionsAllowRealTimeGrading,
  someQuestionsForbidRealTimeGrading,
  savedAnswers,
  suspendedSavedAnswers,
  authorizedEdit,
  hasPassword,
  showClosedAssessment,
  csrfToken,
  onFinish,
}: {
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
  savedAnswers: number;
  suspendedSavedAnswers: number;
  authorizedEdit: boolean;
  hasPassword: boolean;
  showClosedAssessment: boolean;
  csrfToken: string;
  onFinish: () => void;
}) {
  if (someQuestionsAllowRealTimeGrading) {
    return (
      <>
        <form name="grade-form" method="POST">
          <input type="hidden" name="__action" value="grade" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          {savedAnswers > 0 ? (
            <button type="submit" className="btn btn-info" disabled={!authorizedEdit}>
              Grade {savedAnswers} saved {savedAnswers !== 1 ? 'answers' : 'answer'}
            </button>
          ) : (
            <button type="submit" className="btn btn-info" disabled>
              No saved answers to grade
            </button>
          )}
        </form>
        <ul className="mb-0">
          {suspendedSavedAnswers > 1 && (
            <li>
              There are {suspendedSavedAnswers} saved answers that cannot be graded yet because
              their grade rate has not been reached. They are marked with the{' '}
              <i className="fa fa-hourglass-half" /> icon above. Reload this page to update this
              information.
            </li>
          )}
          {suspendedSavedAnswers === 1 && (
            <li>
              There is one saved answer that cannot be graded yet because its grade rate has not
              been reached. It is marked with the <i className="fa fa-hourglass-half" /> icon above.
              Reload this page to update this information.
            </li>
          )}
          <li>
            Submit your answer to each question with the <strong>Save &amp; Grade</strong> or{' '}
            <strong>Save only</strong> buttons on the question page.
          </li>
          <li>
            Look at <strong>Status</strong> to confirm that each question has been{' '}
            {someQuestionsForbidRealTimeGrading ? 'either saved or graded' : 'graded'}. Questions
            with <strong>Available points</strong> can be attempted again for more points.
            Attempting questions again will never reduce the points you already have.
          </li>
          {hasPassword || !showClosedAssessment || someQuestionsForbidRealTimeGrading ? (
            <li>
              After you have answered all the questions completely, click here:{' '}
              <button
                className="btn btn-danger"
                disabled={!authorizedEdit}
                type="button"
                onClick={onFinish}
              >
                Finish assessment
              </button>
            </li>
          ) : (
            <li>
              When you are done, please logout and close your browser. If you have any saved answers
              when you leave, they will be automatically graded before your final score is computed.
            </li>
          )}
        </ul>
      </>
    );
  }

  return (
    <ul className="mb-0">
      <li>
        Submit your answer to each question with the <strong>Save</strong> button on the question
        page.
      </li>
      <li>
        After you have answered all the questions completely, click here:{' '}
        <button
          className="btn btn-danger"
          disabled={!authorizedEdit}
          type="button"
          onClick={onFinish}
        >
          Finish assessment
        </button>
      </li>
    </ul>
  );
}
