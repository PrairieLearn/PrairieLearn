import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';

import { SHORT_NAME_PATTERN } from '../lib/short-name.js';

import { QuestionShortNameDescription } from './ShortNameDescriptions.js';

interface SelectableCardProps {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  cardRef: (el: HTMLElement | null) => void;
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
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
    onKeyDown(e);
  };

  return (
    <div
      ref={cardRef}
      className={clsx('card h-100', {
        'border-primary bg-primary bg-opacity-10': selected,
        'border-secondary': !selected,
      })}
      style={{ cursor: 'pointer' }}
      role="radio"
      tabIndex={selected ? 0 : -1}
      aria-checked={selected}
      aria-labelledby={`${id}_title`}
      aria-describedby={`${id}_description`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div className="card-body text-center d-flex flex-column justify-content-center">
        <div
          id={`${id}_title`}
          className={clsx('card-title', { 'text-primary fw-bold': selected })}
        >
          {title}
        </div>
        <div
          id={`${id}_description`}
          className={clsx('card-text small', { 'text-muted': !selected })}
        >
          {description}
        </div>
      </div>
      {selected && (
        <div className="position-absolute top-0 end-0 p-2">
          <i className="fa fa-check-circle text-primary" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

interface RadioCardGroupProps {
  label: string;
  value: string;
  options: { id: string; title: string; description: string }[];
  onChange: (value: string) => void;
}

function RadioCardGroup({ label, value, options, onChange }: RadioCardGroupProps) {
  const cardsRef = useRef<(HTMLElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
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
      cardsRef.current[newIndex]?.focus();
    }, 0);
  };

  return (
    <fieldset className="mb-3">
      {/* `col-form-label` correctly overrides the default font size for `legend` */}
      <legend className="col-form-label">{label}</legend>
      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
          gap: '1rem',
          gridAutoRows: '1fr',
        }}
      >
        {options.map((option, index) => (
          <SelectableCard
            key={option.id}
            id={option.id}
            title={option.title}
            description={option.description}
            selected={value === option.id}
            cardRef={(el) => {
              cardsRef.current[index] = el;
            }}
            onClick={() => onChange(option.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function CreateQuestionFormContents({
  templateQuestions,
  csrfToken,
  questionsUrl,
}: {
  templateQuestions: { example_course: boolean; qid: string; title: string }[];
  csrfToken: string;
  questionsUrl: string;
}) {
  const [startFrom, setStartFrom] = useState('example');
  const [selectedTemplateQid, setSelectedTemplateQid] = useState('');

  const hasCourseTemplates = templateQuestions.some(({ example_course }) => !example_course);
  const hasExampleTemplates = templateQuestions.some(({ example_course }) => example_course);
  const hasAnyTemplates = hasExampleTemplates || hasCourseTemplates;

  // Filter template questions based on the selected start_from value
  const filteredTemplateQuestions = useMemo(() => {
    return templateQuestions.filter((question) => {
      if (startFrom === 'example') return question.example_course;
      if (startFrom === 'course') return !question.example_course;
      return false;
    });
  }, [startFrom, templateQuestions]);

  const selectedTemplate = filteredTemplateQuestions.find(({ qid }) => qid === selectedTemplateQid);
  const isTemplateSelected = ['example', 'course'].includes(startFrom);

  // Build start from options based on available templates
  const startFromOptions = [
    {
      id: 'example',
      title: 'PrairieLearn template',
      description: 'Start with a pre-built question template',
    },
  ];

  if (hasCourseTemplates) {
    startFromOptions.push({
      id: 'course',
      title: 'Course template',
      description: 'Start with a template from your course',
    });
  }

  startFromOptions.push({
    id: 'empty',
    title: 'Empty question',
    description: 'Start with a blank question and build from scratch',
  });

  return (
    <div style={{ maxWidth: 768, margin: '0 auto' }}>
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0">
          <li className="breadcrumb-item">
            <a href={questionsUrl}>Questions</a>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Create question
          </li>
        </ol>
      </nav>
      <form method="POST" autoComplete="off">
        <div className="mb-3">
          <label className="form-label" htmlFor="title">
            Title
          </label>
          <input
            type="text"
            className="form-control"
            id="title"
            name="title"
            aria-describedby="title_help"
            required
          />
          <small id="title_help" className="form-text text-muted">
            The full name of the question, visible to users.
          </small>
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor="qid">
            Question identifier (QID)
          </label>
          <input
            type="text"
            className="form-control"
            id="qid"
            name="qid"
            aria-describedby="qid_help"
            // TODO: use `validateShortName` with react-hook-form to provide more specific
            //validation feedback (e.g., "cannot start with a slash").
            pattern={SHORT_NAME_PATTERN}
            required
          />
          <small id="qid_help" className="form-text text-muted">
            <QuestionShortNameDescription />
          </small>
        </div>

        {hasAnyTemplates && (
          <RadioCardGroup
            label="Start from"
            value={startFrom}
            options={startFromOptions}
            onChange={setStartFrom}
          />
        )}

        {/* Always include hidden input for form submission */}
        <input type="hidden" name="start_from" value={startFrom} />

        {isTemplateSelected && filteredTemplateQuestions.length > 0 && (
          <div className="mb-3">
            <label className="form-label" htmlFor="template_qid">
              Template
            </label>
            <select
              className="form-select"
              id="template_qid"
              name="template_qid"
              aria-describedby="template_help"
              value={selectedTemplate?.qid ?? ''}
              required
              onChange={(e) => setSelectedTemplateQid(e.currentTarget.value)}
            >
              <option value="">Select a template...</option>
              {filteredTemplateQuestions.map((question) => (
                <option key={question.qid} value={question.qid}>
                  {question.title}
                </option>
              ))}
            </select>
            <small id="template_help" className="form-text text-muted">
              The question will be created from this template. To create your own template, create a
              question with a QID starting with "<code>template/</code>".
            </small>
          </div>
        )}

        <div className="mt-3 d-flex justify-content-end">
          <input type="hidden" name="__action" value="add_question" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="submit" className="btn btn-primary">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

CreateQuestionFormContents.displayName = 'CreateQuestionFormContents';
