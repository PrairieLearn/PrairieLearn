import { useState, useEffect } from 'preact/hooks';

function SelectableCard({
  id,
  title,
  description,
  selected,
  onClick,
}: {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      class={`card h-100 ${selected ? 'border-primary bg-primary bg-opacity-10' : 'border-secondary'} cursor-pointer`}
      style={{ cursor: 'pointer' }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-describedby={`${id}_description`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div class="card-body text-center">
        <h5 class={`card-title ${selected ? 'text-primary' : ''}`}>{title}</h5>
        <p id={`${id}_description`} class="card-text text-muted small">
          {description}
        </p>
      </div>
      {selected && (
        <div class="position-absolute top-0 end-0 p-2">
          <i class="fa fa-check-circle text-primary" aria-label="Selected"></i>
        </div>
      )}
    </div>
  );
}

export function CreateQuestionModalContents({
  templateQuestions,
}: {
  templateQuestions: { example_course: boolean; qid: string; title: string }[];
}) {
  const [startFrom, setStartFrom] = useState('empty');
  const [selectedTemplateQid, setSelectedTemplateQid] = useState('');

  // Filter template questions based on the selected start_from value
  const filteredTemplateQuestions = templateQuestions.filter((question) => {
    if (startFrom === 'example') return question.example_course;
    if (startFrom === 'course') return !question.example_course;
    return false;
  });

  // When startFrom changes, auto-select the first available template
  useEffect(() => {
    if (filteredTemplateQuestions.length > 0) {
      setSelectedTemplateQid(filteredTemplateQuestions[0].qid);
    } else {
      setSelectedTemplateQid('');
    }
  }, [startFrom, filteredTemplateQuestions.length]);

  const isTemplateSelected = ['example', 'course'].includes(startFrom);
  const hasCourseTemplates = templateQuestions.some(({ example_course }) => !example_course);

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
        <label class="form-label">Start from</label>
        <div class="row g-3" role="group" aria-labelledby="start_from_label">
          <div class={hasCourseTemplates ? 'col-md-4' : 'col-md-6'}>
            <SelectableCard
              id="empty"
              title="Empty question"
              description="Start with a blank question and build from scratch"
              selected={startFrom === 'empty'}
              onClick={() => setStartFrom('empty')}
            />
          </div>
          <div class={hasCourseTemplates ? 'col-md-4' : 'col-md-6'}>
            <SelectableCard
              id="example"
              title="PrairieLearn template"
              description="Start with a pre-built PrairieLearn question template"
              selected={startFrom === 'example'}
              onClick={() => setStartFrom('example')}
            />
          </div>
          {hasCourseTemplates && (
            <div class="col-md-4">
              <SelectableCard
                id="course"
                title="Course template"
                description="Start with a template from your course"
                selected={startFrom === 'course'}
                onClick={() => setStartFrom('course')}
              />
            </div>
          )}
        </div>
        {/* Hidden input for the form submission */}
        <input type="hidden" name="start_from" value={startFrom} />
      </div>

      {isTemplateSelected && (
        <div class="mb-3">
          <label class="form-label" for="template_qid">
            Template
          </label>
          <select
            class="form-select"
            id="template_qid"
            name="template_qid"
            required
            aria-describedby="template_help"
            value={selectedTemplateQid}
            onChange={(e) => setSelectedTemplateQid((e.target as HTMLSelectElement).value)}
          >
            {filteredTemplateQuestions.map((question) => (
              <option key={question.qid} value={question.qid}>
                {question.title}
              </option>
            ))}
          </select>
          <small id="template_help" class="form-text text-muted">
            The question will be created from this template. To create your own template, create a
            question with a QID starting with "<code>template/</code>".
          </small>
        </div>
      )}
    </>
  );
}

CreateQuestionModalContents.displayName = 'CreateQuestionModalContents';
