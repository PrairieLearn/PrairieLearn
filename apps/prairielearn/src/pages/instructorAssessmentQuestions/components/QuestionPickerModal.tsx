import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import { Modal } from 'react-bootstrap';

import { FilterDropdown, type FilterItem, OverlayTrigger } from '@prairielearn/ui';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import { getQuestionUrl } from '../../../lib/client/url.js';
import type { AssessmentForPicker, CourseQuestionForPicker } from '../types.js';

/** Special filter ID for questions not in any assessment */
const NOT_IN_ANY_ASSESSMENT_ID = '__not_in_any_assessment__';
const PINNED_ASSESSMENT_IDS = new Set([NOT_IN_ANY_ASSESSMENT_ID]);

export interface QuestionPickerModalProps {
  show: boolean;
  onHide: () => void;
  onQuestionSelected: (qid: string) => void;
  courseQuestions: CourseQuestionForPicker[];
  isLoading?: boolean;
  questionsInAssessment: Set<string>;
  urlPrefix: string;
  /** The QID of the currently selected question (when editing/changing a question) */
  currentQid?: string | null;
  /** The ID of the current assessment being edited (to exclude from badges) */
  currentAssessmentId?: string;
}

/**
 * Groups assessments by their set abbreviation and returns them sorted.
 * Returns null if abbreviation data is not available.
 */
function groupByAbbreviation(
  assessments: AssessmentForPicker[],
): Map<string, AssessmentForPicker[]> | null {
  // Check if we have abbreviation data (needed for grouping)
  if (!assessments.every((a) => a.assessment_set_abbreviation && a.assessment_number)) {
    return null;
  }

  const grouped = new Map<string, AssessmentForPicker[]>();

  for (const assessment of assessments) {
    const abbrev = assessment.assessment_set_abbreviation!;
    const existing = grouped.get(abbrev) ?? [];
    existing.push(assessment);
    grouped.set(abbrev, existing);
  }

  // Sort items within each group by assessment number
  for (const items of grouped.values()) {
    items.sort((a, b) => {
      const numA = Number.parseInt(a.assessment_number!) || 0;
      const numB = Number.parseInt(b.assessment_number!) || 0;
      return numA - numB;
    });
  }

  // Return sorted by abbreviation
  return new Map([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Renders assessment badges with grouping for compact display.
 * Groups of 3+ assessments with the same abbreviation are collapsed.
 */
function AssessmentBadges({
  assessments,
  urlPrefix,
}: {
  assessments: AssessmentForPicker[];
  urlPrefix: string;
}) {
  if (assessments.length === 0) {
    return null;
  }

  const grouped = groupByAbbreviation(assessments);

  // Fallback to simple badges if grouping data isn't available
  if (!grouped) {
    return (
      <>
        {assessments.slice(0, 3).map((assessment) => (
          <span key={assessment.assessment_id} className="d-inline-block me-1">
            <AssessmentBadge
              urlPrefix={urlPrefix}
              assessment={{
                assessment_id: assessment.assessment_id,
                color: assessment.color,
                label: assessment.label,
              }}
            />
          </span>
        ))}
        {assessments.length > 3 && (
          <span className="badge bg-secondary">+{assessments.length - 3}</span>
        )}
      </>
    );
  }

  const elements: React.ReactNode[] = [];

  for (const [abbrev, items] of grouped) {
    if (items.length < 3) {
      // Render individual badges
      for (const assessment of items) {
        elements.push(
          <span key={assessment.assessment_id} className="d-inline-block me-1">
            <AssessmentBadge
              urlPrefix={urlPrefix}
              assessment={{
                assessment_id: assessment.assessment_id,
                color: assessment.assessment_set_color ?? assessment.color,
                label: assessment.label,
              }}
            />
          </span>,
        );
      }
    } else {
      // Render a grouped badge with popover
      const color = items[0].assessment_set_color ?? items[0].color;
      const name = items[0].assessment_set_name ?? abbrev;
      elements.push(
        <span key={`group-${abbrev}`} className="d-inline-block me-1">
          <OverlayTrigger
            trigger="click"
            placement="auto"
            popover={{
              props: { id: `picker-assessments-popover-${abbrev}` },
              header: `${name} (${items.length})`,
              body: (
                <div className="d-flex flex-wrap gap-1">
                  {items.map((assessment) => (
                    <AssessmentBadge
                      key={assessment.assessment_id}
                      urlPrefix={urlPrefix}
                      assessment={{
                        assessment_id: assessment.assessment_id,
                        color: assessment.assessment_set_color ?? assessment.color,
                        label: assessment.label,
                      }}
                    />
                  ))}
                </div>
              ),
            }}
            rootClose
          >
            <button
              type="button"
              className={`btn btn-badge color-${color}`}
              aria-label={`${abbrev}: ${items.length} assessments`}
              onClick={(e) => e.stopPropagation()}
            >
              {abbrev} ×{items.length}
            </button>
          </OverlayTrigger>
        </span>,
      );
    }
  }

  return <>{elements}</>;
}

/**
 * Modal for picking a question to add to an assessment.
 * Features search, topic/tag/assessment filters, and a virtualized list.
 */
export function QuestionPickerModal({
  show,
  onHide,
  onQuestionSelected,
  courseQuestions,
  isLoading,
  questionsInAssessment,
  urlPrefix,
  currentQid,
  currentAssessmentId,
}: QuestionPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(() => new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set());
  const [selectedAssessments, setSelectedAssessments] = useState<Set<string>>(() => new Set());
  const [expandedTagsQids, setExpandedTagsQids] = useState<Set<string>>(() => new Set());

  const parentRef = useRef<HTMLDivElement>(null);

  // Extract unique topics, tags, and assessments from course questions
  const { topics, tags, assessments } = useMemo(() => {
    const topicMap = new Map<string, FilterItem>();
    const tagMap = new Map<string, FilterItem>();
    const assessmentMap = new Map<string, FilterItem>();

    courseQuestions.forEach((q) => {
      const t = q.topic;
      topicMap.set(String(t.id), { id: String(t.id), name: t.name, color: t.color });
      q.tags?.forEach((tag) => {
        tagMap.set(String(tag.id), { id: String(tag.id), name: tag.name, color: tag.color });
      });
      q.assessments?.forEach((assessment) => {
        // Exclude current assessment from filter options
        if (assessment.assessment_id !== currentAssessmentId) {
          assessmentMap.set(assessment.assessment_id, {
            id: assessment.assessment_id,
            name: assessment.label,
            color: assessment.color,
          });
        }
      });
    });

    // Sort assessments by label (which includes number)
    const sortedAssessments = Array.from(assessmentMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );

    // Add special "Not in any assessment" option at the beginning
    const assessmentsWithSpecial: FilterItem[] = [
      { id: NOT_IN_ANY_ASSESSMENT_ID, name: 'None' },
      ...sortedAssessments,
    ];

    return {
      topics: Array.from(topicMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      tags: Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      assessments: assessmentsWithSpecial,
    };
  }, [courseQuestions, currentAssessmentId]);

  // Filter questions based on search and filters
  const filteredQuestions = useMemo(() => {
    return courseQuestions.filter((q) => {
      const searchLower = searchQuery.toLowerCase().trim();

      // Search: QID + title (case-insensitive substring)
      const matchesSearch =
        !searchLower ||
        q.qid.toLowerCase().includes(searchLower) ||
        q.title.toLowerCase().includes(searchLower);

      // Topic filter (OR logic)
      const matchesTopic = selectedTopics.size === 0 || selectedTopics.has(String(q.topic.id));

      // Tags filter (OR logic - matches if ANY tag is selected)
      const matchesTags =
        selectedTags.size === 0 || q.tags?.some((tag) => selectedTags.has(String(tag.id)));

      // Assessment filter (OR logic with special handling for "not in any")
      let matchesAssessment = selectedAssessments.size === 0;
      if (!matchesAssessment) {
        const hasNoAssessments = !q.assessments || q.assessments.length === 0;
        const notInAnySelected = selectedAssessments.has(NOT_IN_ANY_ASSESSMENT_ID);

        if (notInAnySelected && hasNoAssessments) {
          matchesAssessment = true;
        } else {
          // Check if question is in any selected assessment (excluding the special option)
          matchesAssessment =
            q.assessments?.some(
              (a) =>
                selectedAssessments.has(a.assessment_id) &&
                a.assessment_id !== NOT_IN_ANY_ASSESSMENT_ID,
            ) ?? false;
        }
      }

      return matchesSearch && matchesTopic && matchesTags && matchesAssessment;
    });
  }, [courseQuestions, searchQuery, selectedTopics, selectedTags, selectedAssessments]);

  // Sort filtered questions by QID
  const sortedQuestions = useMemo(
    () => [...filteredQuestions].sort((a, b) => a.qid.localeCompare(b.qid)),
    [filteredQuestions],
  );

  // Virtual scrolling setup with dynamic measurement for variable height rows
  const rowVirtualizer = useVirtualizer({
    count: sortedQuestions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Increased to account for assessment badges row
    overscan: 10,
    getItemKey: (index) => sortedQuestions[index].qid,
  });

  const handleSelect = (question: CourseQuestionForPicker) => {
    const qid = question.qid;
    // Allow selecting the current question (when changing selection) but not other already-added questions
    if (questionsInAssessment.has(qid) && qid !== currentQid) {
      return; // Don't allow selecting already-added questions
    }
    onQuestionSelected(qid);
    resetFilters();
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedTopics(new Set());
    setSelectedTags(new Set());
    setSelectedAssessments(new Set());
    setExpandedTagsQids(new Set());
  };

  const hasActiveFilters =
    selectedTopics.size > 0 || selectedTags.size > 0 || selectedAssessments.size > 0;

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <Modal show={show} size="lg" onHide={onHide} onExited={resetFilters}>
      <Modal.Header closeButton>
        <Modal.Title>Select question</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
        {isLoading ? (
          <div className="d-flex flex-column align-items-center justify-content-center py-5">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <span className="text-muted">Loading questions...</span>
          </div>
        ) : (
          <>
            <div className="p-3 border-bottom">
              <div className="mb-2">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by QID or title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <FilterDropdown
                  label="Topic"
                  items={topics}
                  selectedIds={selectedTopics}
                  // 20 items, about 28px tall, plus space for clear
                  maxHeight={20 * 28 + 50}
                  onChange={setSelectedTopics}
                />
                <FilterDropdown
                  label="Tags"
                  items={tags}
                  selectedIds={selectedTags}
                  // 20 items, about 28px tall, plus space for clear
                  maxHeight={20 * 28 + 50}
                  onChange={setSelectedTags}
                />
                <FilterDropdown
                  label="Assessment"
                  items={assessments}
                  selectedIds={selectedAssessments}
                  pinnedIds={PINNED_ASSESSMENT_IDS}
                  // 20 items, about 28px tall, plus space for clear
                  maxHeight={20 * 28 + 50}
                  onChange={setSelectedAssessments}
                />
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-decoration-none"
                    onClick={() => {
                      setSelectedTopics(new Set());
                      setSelectedTags(new Set());
                      setSelectedAssessments(new Set());
                    }}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </div>
            <div className="px-3 py-2 bg-light border-bottom text-muted small">
              {sortedQuestions.length} {sortedQuestions.length === 1 ? 'question' : 'questions'}{' '}
              found
            </div>
            <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
              {sortedQuestions.length === 0 ? (
                <div className="p-4 text-center text-muted">
                  <i className="bi bi-search display-6 mb-2" aria-hidden="true" />
                  <p>No questions match your search criteria.</p>
                </div>
              ) : (
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualRows.map((virtualRow) => {
                    const question = sortedQuestions[virtualRow.index];
                    const qid = question.qid;
                    const isCurrentSelection = qid === currentQid;
                    const isAlreadyAdded = questionsInAssessment.has(qid) && !isCurrentSelection;

                    // Filter out current assessment from badges
                    const assessmentsToShow =
                      question.assessments?.filter(
                        (a) => a.assessment_id !== currentAssessmentId,
                      ) ?? [];

                    return (
                      <div
                        key={virtualRow.key}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        role="button"
                        tabIndex={isAlreadyAdded ? -1 : 0}
                        className={clsx(
                          'd-flex align-items-start gap-2 px-3 py-2 border-bottom',
                          isAlreadyAdded
                            ? 'bg-light text-muted'
                            : 'cursor-pointer question-picker-row',
                        )}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          cursor: isAlreadyAdded ? 'not-allowed' : 'pointer',
                        }}
                        aria-disabled={isAlreadyAdded}
                        onClick={() => handleSelect(question)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelect(question);
                          }
                        }}
                      >
                        <div className="flex-grow-1 min-width-0">
                          <div className="d-flex align-items-center gap-2">
                            <a
                              href={getQuestionUrl({ urlPrefix, questionId: question.id })}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <code>{qid}</code>
                            </a>
                            {isCurrentSelection && (
                              <span className="badge bg-primary">Current selection</span>
                            )}
                            {isAlreadyAdded && (
                              <span className="badge bg-secondary">Already added</span>
                            )}
                          </div>
                          <div className="text-truncate small">{question.title}</div>
                          {assessmentsToShow.length > 0 && (
                            <div className="d-flex flex-wrap gap-1 mt-1">
                              <AssessmentBadges
                                assessments={assessmentsToShow}
                                urlPrefix={urlPrefix}
                              />
                            </div>
                          )}
                        </div>
                        <div
                          className="d-flex flex-wrap gap-1 justify-content-end"
                          style={{ maxWidth: '40%' }}
                        >
                          <span className={`badge color-${question.topic.color}`}>
                            {question.topic.name}
                          </span>
                          {(expandedTagsQids.has(qid)
                            ? question.tags
                            : question.tags?.slice(0, 3)
                          )?.map((tag) => (
                            <span key={tag.id} className={`badge color-${tag.color}`}>
                              {tag.name}
                            </span>
                          ))}
                          {(question.tags?.length ?? 0) > 3 &&
                            (expandedTagsQids.has(qid) ? (
                              <button
                                type="button"
                                className="badge bg-secondary border-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedTagsQids((prev) => {
                                    const next = new Set(prev);
                                    next.delete(qid);
                                    return next;
                                  });
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                Show less
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="badge bg-secondary border-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedTagsQids((prev) => new Set(prev).add(qid));
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                +{(question.tags?.length ?? 0) - 3}
                              </button>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          Cancel
        </button>
      </Modal.Footer>
    </Modal>
  );
}
