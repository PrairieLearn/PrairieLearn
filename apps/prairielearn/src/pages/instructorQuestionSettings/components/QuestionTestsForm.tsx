export function QuestionTestsForm({
  questionTestPath,
  csrfToken,
}: {
  questionTestPath: string;
  csrfToken: string;
}) {
  return (
    <form
      name="question-tests-form"
      method="POST"
      action={questionTestPath}
      className="d-flex flex-wrap gap-2"
    >
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <button
        type="submit"
        className="btn btn-sm btn-outline-primary"
        name="__action"
        value="test_once"
      >
        Test once with full details
      </button>
      <button
        type="submit"
        className="btn btn-sm btn-outline-primary"
        name="__action"
        value="test_100"
      >
        Test 100 times with only results
      </button>
    </form>
  );
}
