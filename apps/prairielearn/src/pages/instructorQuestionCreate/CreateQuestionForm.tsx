import clsx from 'clsx';
import { useCallback, useMemo, useRef, useState } from 'react';

import { QuestionShortNameDescription } from '../../components/ShortNameDescriptions.js';
import { SHORT_NAME_PATTERN } from '../../lib/short-name.js';
import type {
  TemplateQuestion,
  TemplateQuestionZone,
} from '../instructorQuestions/templateQuestions.js';

import { EvocativePreview } from './EvocativePreview.js';

// ---------------------------------------------------------------------------
// SelectableCard + RadioCardGroup (reused for "Start from" selector)
// ---------------------------------------------------------------------------

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

function RadioCardGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; title: string; description: string }[];
  onChange: (value: string) => void;
}) {
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

// ---------------------------------------------------------------------------
// Template card components
// ---------------------------------------------------------------------------

function TemplateCardRadioGroup({
  label,
  cards,
  selectedQid,
  onSelect,
  showPreviews,
}: {
  label: string;
  cards: TemplateQuestion[];
  selectedQid: string;
  onSelect: (qid: string) => void;
  showPreviews: boolean;
}) {
  const cardsRef = useRef<(HTMLElement | null)[]>([]);
  const [expandedQid, setExpandedQid] = useState<string | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        newIndex = (currentIndex + 1) % cards.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = currentIndex === 0 ? cards.length - 1 : currentIndex - 1;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = cards.length - 1;
        break;
      default:
        return;
    }

    onSelect(cards[newIndex].qid);

    setTimeout(() => {
      cardsRef.current[newIndex]?.focus();
    }, 0);
  };

  if (showPreviews) {
    return (
      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        {cards.map((card, index) => {
          const isSelected = selectedQid === card.qid;
          return (
            <div
              key={card.qid}
              ref={(el) => {
                cardsRef.current[index] = el;
              }}
              className={clsx('card', {
                'border-primary': isSelected,
                'border-secondary': !isSelected,
              })}
              style={{ cursor: 'pointer' }}
              role="radio"
              tabIndex={isSelected ? 0 : -1}
              aria-checked={isSelected}
              aria-label={card.title}
              onClick={() => onSelect(card.qid)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(card.qid);
                }
                handleKeyDown(e, index);
              }}
            >
              <EvocativePreview qid={card.qid} />
              <div
                className={clsx('card-body py-2 px-3', {
                  'bg-primary bg-opacity-10': isSelected,
                })}
              >
                <div
                  className={clsx('card-title small mb-0', {
                    'text-primary fw-bold': isSelected,
                  })}
                >
                  {card.title}
                </div>
              </div>
              {isSelected && (
                <div className="position-absolute top-0 end-0 p-1">
                  <i className="fa fa-check-circle text-primary" aria-hidden="true" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Compact list for intermediate/advanced templates
  return (
    <div role="radiogroup" aria-label={label} className="d-flex flex-column gap-2">
      {cards.map((card, index) => {
        const isSelected = selectedQid === card.qid;
        const isExpanded = expandedQid === card.qid;
        return (
          <div
            key={card.qid}
            ref={(el) => {
              cardsRef.current[index] = el;
            }}
            className={clsx('card', {
              'border-primary bg-primary bg-opacity-10': isSelected,
              'border-secondary': !isSelected,
            })}
            style={{ cursor: 'pointer' }}
            role="radio"
            tabIndex={isSelected ? 0 : -1}
            aria-checked={isSelected}
            aria-label={card.title}
            onClick={() => onSelect(card.qid)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(card.qid);
              }
              handleKeyDown(e, index);
            }}
          >
            <div className="card-body py-2 px-3">
              <div className="d-flex align-items-center justify-content-between">
                <span
                  className={clsx('small', {
                    'text-primary fw-bold': isSelected,
                  })}
                >
                  {card.title}
                </span>
                <div className="d-flex align-items-center gap-2">
                  {isSelected && (
                    <i className="fa fa-check-circle text-primary" aria-hidden="true" />
                  )}
                  {card.readme && (
                    <button
                      type="button"
                      className="btn btn-sm btn-link p-0 text-muted"
                      aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${card.title}`}
                      aria-expanded={isExpanded}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedQid(isExpanded ? null : card.qid);
                      }}
                    >
                      <i
                        className={clsx('fa', {
                          'fa-chevron-up': isExpanded,
                          'fa-info-circle': !isExpanded,
                        })}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && card.readme && (
                <p className="small text-muted mb-0 mt-1">{card.readme.trim()}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search helper
// ---------------------------------------------------------------------------

function matchesSearch(query: string, question: TemplateQuestion): boolean {
  const lowerQuery = query.toLowerCase();
  if (question.title.toLowerCase().includes(lowerQuery)) return true;
  if (question.readme?.toLowerCase().includes(lowerQuery)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Main form component
// ---------------------------------------------------------------------------

export function CreateQuestionForm({
  exampleCourseZones,
  courseTemplates,
  csrfToken,
  questionsUrl,
}: {
  exampleCourseZones: TemplateQuestionZone[];
  courseTemplates: { qid: string; title: string }[];
  csrfToken: string;
  questionsUrl: string;
}) {
  const [startFrom, setStartFrom] = useState(
    exampleCourseZones.length > 0 ? 'example' : courseTemplates.length > 0 ? 'course' : 'empty',
  );
  const [selectedTemplateQid, setSelectedTemplateQid] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const hasCourseTemplates = courseTemplates.length > 0;
  const hasExampleTemplates = exampleCourseZones.length > 0;
  const hasAnyTemplates = hasExampleTemplates || hasCourseTemplates;
  const isTemplateSelected = ['example', 'course'].includes(startFrom);

  // Filter zones/templates by search query
  const filteredZones = useMemo(() => {
    if (!searchQuery) return exampleCourseZones;
    return exampleCourseZones
      .map((zone) => ({
        ...zone,
        questions: zone.questions.filter((q) => matchesSearch(searchQuery, q)),
      }))
      .filter((zone) => zone.questions.length > 0);
  }, [searchQuery, exampleCourseZones]);

  const filteredCourseTemplates = useMemo(() => {
    if (!searchQuery) return courseTemplates;
    const lowerQuery = searchQuery.toLowerCase();
    return courseTemplates.filter((t) => t.title.toLowerCase().includes(lowerQuery));
  }, [searchQuery, courseTemplates]);

  const totalFilteredCount = useMemo(() => {
    if (startFrom === 'example') {
      return filteredZones.reduce((sum, z) => sum + z.questions.length, 0);
    }
    if (startFrom === 'course') {
      return filteredCourseTemplates.length;
    }
    return 0;
  }, [startFrom, filteredZones, filteredCourseTemplates]);

  // Deselect template if it's been filtered out
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (query && selectedTemplateQid) {
        // Check if the selected template is still visible
        const isVisible =
          startFrom === 'example'
            ? exampleCourseZones.some((z) =>
                z.questions.some((q) => q.qid === selectedTemplateQid && matchesSearch(query, q)),
              )
            : courseTemplates.some(
                (t) =>
                  t.qid === selectedTemplateQid &&
                  t.title.toLowerCase().includes(query.toLowerCase()),
              );
        if (!isVisible) {
          setSelectedTemplateQid('');
        }
      }
    },
    [startFrom, selectedTemplateQid, exampleCourseZones, courseTemplates],
  );

  const handleStartFromChange = useCallback((value: string) => {
    setStartFrom(value);
    setSelectedTemplateQid('');
    setSearchQuery('');
  }, []);

  // Build start from options
  const startFromOptions = [];

  if (hasExampleTemplates) {
    startFromOptions.push({
      id: 'example',
      title: 'PrairieLearn template',
      description: 'Start with a pre-built question template',
    });
  }

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
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
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
            onChange={handleStartFromChange}
          />
        )}

        {/* Hidden inputs for form submission */}
        <input type="hidden" name="start_from" value={startFrom} />
        <input
          type="hidden"
          name="template_qid"
          value={isTemplateSelected ? selectedTemplateQid : ''}
        />

        {/* Search + template gallery */}
        {isTemplateSelected && (
          <div className="mb-3">
            <label className="form-label" htmlFor="template_search">
              Search templates
            </label>
            <input
              type="search"
              className="form-control"
              id="template_search"
              placeholder="Search by name or description..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.currentTarget.value)}
            />

            {/* Live region for search result count */}
            <div className="visually-hidden" aria-live="polite" aria-atomic="true">
              {searchQuery
                ? `${totalFilteredCount} template${totalFilteredCount !== 1 ? 's' : ''} found`
                : ''}
            </div>

            {/* PrairieLearn templates */}
            {startFrom === 'example' && (
              <div className="mt-3">
                {filteredZones.length > 0 ? (
                  <div className="d-flex flex-column gap-4">
                    {filteredZones.map((zone, zoneIndex) => (
                      <section key={zone.title} aria-label={zone.title}>
                        <h3 className="h6 text-muted mb-2">{zone.title}</h3>
                        <TemplateCardRadioGroup
                          label={zone.title}
                          cards={zone.questions}
                          selectedQid={selectedTemplateQid}
                          showPreviews={zoneIndex === 0}
                          onSelect={setSelectedTemplateQid}
                        />
                      </section>
                    ))}
                  </div>
                ) : (
                  <EmptySearchState
                    query={searchQuery}
                    onStartFromScratch={() => handleStartFromChange('empty')}
                  />
                )}
              </div>
            )}

            {/* Course templates */}
            {startFrom === 'course' && (
              <div className="mt-3">
                {filteredCourseTemplates.length > 0 ? (
                  <TemplateCardRadioGroup
                    label="Course templates"
                    cards={filteredCourseTemplates.map((t) => ({
                      ...t,
                      readme: null,
                    }))}
                    selectedQid={selectedTemplateQid}
                    showPreviews={false}
                    onSelect={setSelectedTemplateQid}
                  />
                ) : (
                  <EmptySearchState
                    query={searchQuery}
                    onStartFromScratch={() => handleStartFromChange('empty')}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty question state */}
        {startFrom === 'empty' && <StartFromScratchState />}

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

CreateQuestionForm.displayName = 'CreateQuestionForm';

// ---------------------------------------------------------------------------
// Empty search state
// ---------------------------------------------------------------------------

function EmptySearchState({
  query,
  onStartFromScratch,
}: {
  query: string;
  onStartFromScratch: () => void;
}) {
  return (
    <div className="text-center py-4">
      <p className="text-muted mb-2">No templates match{query ? ` "${query}"` : ''}.</p>
      <button type="button" className="btn btn-outline-primary btn-sm" onClick={onStartFromScratch}>
        Start from scratch instead
      </button>
    </div>
  );
}

function StartFromScratchState() {
  return (
    <div className="d-flex justify-content-center my-3">
      <div
        className="text-center py-5 px-4"
        style={{
          maxWidth: 500,
          width: '100%',
          border: '2px dashed #dee2e6',
          borderRadius: 12,
          backgroundColor: '#f8f9fa',
        }}
      >
        <div
          className="d-inline-flex align-items-center justify-content-center mb-3"
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            backgroundColor: '#e9ecef',
          }}
        >
          <i className="fa fa-file-alt fa-lg text-muted" aria-hidden="true" />
        </div>
        <h3 className="h5 mb-2">Start from scratch</h3>
        <p className="text-muted mb-0">
          You'll get a blank question with the basic file structure. Perfect if you already know
          what you're building.
        </p>
      </div>
    </div>
  );
}
