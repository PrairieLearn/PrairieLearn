export function CreateQuestionModalContents({
  templateQuestions,
}: {
  templateQuestions: { example_course: boolean; qid: string; title: string }[];
}) {
  return (
    <>
      <div class="mb-3">
        <label class="form-label" for="title">
          Title
        </label>
        <input
          type="text"
          class="form-control"
          id="title"
          name="title"
          required
          aria-describedby="title_help"
        />
        <small id="title_help" class="form-text text-muted">
          The full name of the question, visible to users.
        </small>
      </div>
      <div class="mb-3">
        <label class="form-label" for="qid">
          Question identifier (QID)
        </label>
        <input
          type="text"
          class="form-control"
          id="qid"
          name="qid"
          required
          pattern="[\\-A-Za-z0-9_\\/]+"
          aria-describedby="qid_help"
        />
        <small id="qid_help" class="form-text text-muted">
          A short unique identifier for this question, such as "add-vectors" or "find-derivative".
          Use only letters, numbers, dashes, and underscores, with no spaces.
        </small>
      </div>
      <div class="mb-3">
        <label class="form-label" for="start_from">
          Start from
        </label>
        <select
          class="form-select"
          id="start_from"
          name="start_from"
          required
          aria-describedby="start_from_help"
        >
          <option value="empty">Empty question</option>
          <option value="example">PrairieLearn template</option>
          {templateQuestions.some(({ example_course }) => !example_course) ? (
            <option value="course">Course-specific template</option>
          ) : null}
        </select>
        <small id="start_from_help" class="form-text text-muted">
          Begin with an empty question or a pre-made question template.
        </small>
      </div>

      <div id="templateContainer" class="mb-3" hidden>
        <label class="form-label" for="template_qid">
          Template
        </label>
        <select
          class="form-select"
          id="template_qid"
          name="template_qid"
          required
          aria-describedby="template_help"
          disabled
        >
          {templateQuestions.map((question) => (
            <option
              data-template-source={question.example_course ? 'example' : 'course'}
              value={question.qid}
            >
              {question.title}
            </option>
          ))}
        </select>
        <small id="template_help" class="form-text text-muted">
          The question will be created from this template. To create your own template, create a
          question with a QID starting with "<code>template/</code>".
        </small>
      </div>
    </>
  );
}

CreateQuestionModalContents.displayName = 'CreateQuestionModalContents';
