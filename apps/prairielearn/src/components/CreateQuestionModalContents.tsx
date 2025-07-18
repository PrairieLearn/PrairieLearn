import { useState, useEffect, useRef } from 'preact/hooks';

interface SelectableCardProps {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  cardRef?: (el: HTMLElement | null) => void;
}

function SelectableCard({
  id,
  title,
  description,
  selected,
  onClick,
  onKeyDown,
  cardRef,
}: SelectableCardProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
    onKeyDown?.(e);
  };

  return (
    <div
      ref={cardRef}
      class={`card h-100 ${selected ? 'border-primary bg-primary bg-opacity-10' : 'border-secondary'}`}
      style={{ cursor: 'pointer' }}
      role="radio"
      tabIndex={selected ? 0 : -1}
      aria-checked={selected}
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

interface RadioCardGroupProps {
  label: string;
  value: string;
  options: Array<{ id: string; title: string; description: string }>;
  onChange: (value: string) => void;
  columnClass: string;
}

function RadioCardGroup({ label, value, options, onChange, columnClass }: RadioCardGroupProps) {
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  const handleKeyDown = (e: KeyboardEvent, currentIndex: number) => {
    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        newIndex = (currentIndex + 1) % options.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = currentIndex === 0 ? options.length - 1 : currentIndex - 1;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = options.length - 1;
        break;
      default:
        return;
    }

    onChange(options[newIndex].id);

    // Focus the newly selected element, but only after a rerender.
    setTimeout(() => {
      cardRefs.current[newIndex]?.focus();
    }, 0);
  };

  return (
    <fieldset class="mb-3">
      <legend class="col-form-label">{label}</legend>
      <div class="row gx-3" role="radiogroup" aria-label={label}>
        {options.map((option, index) => (
          <div key={option.id} class={columnClass}>
            <SelectableCard
              id={option.id}
              title={option.title}
              description={option.description}
              selected={value === option.id}
              onClick={() => onChange(option.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              cardRef={(el) => {
                cardRefs.current[index] = el;
              }}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function CreateQuestionModalContents({
  templateQuestions,
}: {
  templateQuestions: { example_course: boolean; qid: string; title: string }[];
}) {
  const hasCourseTemplates = templateQuestions.some(({ example_course }) => !example_course);
  const hasExampleTemplates = templateQuestions.some(({ example_course }) => example_course);
  const hasAnyTemplates = hasExampleTemplates || hasCourseTemplates;

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

  // Build start from options based on available templates
  const startFromOptions = [
    {
      id: 'empty',
      title: 'Empty question',
      description: 'Start with a blank question and build from scratch',
    },
  ];

  if (hasExampleTemplates) {
    startFromOptions.push({
      id: 'example',
      title: 'PrairieLearn template',
      description: 'Start with a pre-built PrairieLearn question template',
    });
  }

  if (hasCourseTemplates) {
    startFromOptions.push({
      id: 'course',
      title: 'Course template',
      description: 'Start with a template from your course',
    });
  }

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

      {hasAnyTemplates && (
        <RadioCardGroup
          label="Start from"
          value={startFrom}
          options={startFromOptions}
          onChange={setStartFrom}
          columnClass={startFromOptions.length === 2 ? 'col-md-6' : 'col-md-4'}
        />
      )}

      {/* Always include hidden input for form submission */}
      <input type="hidden" name="start_from" value={startFrom} />

      {isTemplateSelected && filteredTemplateQuestions.length > 0 && (
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
