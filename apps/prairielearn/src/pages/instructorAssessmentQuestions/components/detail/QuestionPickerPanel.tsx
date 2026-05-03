import { rankItem } from '@tanstack/match-sorter-utils';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TRPCClientError } from '@trpc/client';
import { useEffect, useMemo, useRef, useState } from 'react';

import { run } from '@prairielearn/run';
import { FilterDropdown, type FilterItem } from '@prairielearn/ui';

import { getQuestionCreateUrl, getQuestionUrl } from '../../../../lib/client/url.js';
import type { QuestionByQidResult } from '../../../../trpc/assessment/assessment-questions.js';
import { useTRPC } from '../../../../trpc/assessment/context.js';
import type { CourseQuestionForPicker } from '../../types.js';
import { AssessmentBadges } from '../AssessmentBadges.js';
import { QuestionTopicTagBadges } from '../QuestionTopicTagBadges.js';

const NOT_IN_ANY_ASSESSMENT_ID = '__not_in_any_assessment__';
const PINNED_ASSESSMENT_IDS = new Set([NOT_IN_ANY_ASSESSMENT_ID]);

const GRADING_METHOD_ITEMS: FilterItem[] = [
  { id: 'Internal', name: 'Internal' },
  { id: 'External', name: 'External' },
  { id: 'Manual', name: 'Manual' },
];

export function QuestionPickerPanel({
  courseQuestions,
  isLoading,
  questionsInAssessment,
  disabledQids,
  currentChangeQid,
  isPickingQuestion,
  pickerError,
  courseId,
  courseInstanceId,
  currentAssessmentId,
  questionSharingEnabled,
  consumePublicQuestionsEnabled,
  onQuestionSelected,
  onRemoveQuestionByQid,
}: {
  courseQuestions: CourseQuestionForPicker[];
  isLoading?: boolean;
  questionsInAssessment: Map<string, string[]>;
  disabledQids: Set<string>;
  currentChangeQid?: string;
  courseId: string;
  courseInstanceId: string;
  currentAssessmentId?: string;
  isPickingQuestion?: boolean;
  pickerError: Error | null;
  questionSharingEnabled: boolean;
  consumePublicQuestionsEnabled: boolean;
  onQuestionSelected: (qid: string) => void;
  onRemoveQuestionByQid: (qid: string) => void;
}) {
  const trpc = useTRPC();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(() => new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set());
  const [selectedAssessments, setSelectedAssessments] = useState<Set<string>>(() => new Set());
  const [selectedGradingMethods, setSelectedGradingMethods] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedTagsQids, setExpandedTagsQids] = useState<Set<string>>(() => new Set());

  const sharedQuestionMode =
    searchQuery.startsWith('@') && (questionSharingEnabled || consumePublicQuestionsEnabled);
  const hasSlash = sharedQuestionMode && debouncedSearchQuery.includes('/');

  const sharedQuestionQuery = useQuery({
    ...trpc.assessmentQuestions.questionByQid.queryOptions(
      { qid: debouncedSearchQuery },
      { enabled: hasSlash },
    ),
    retry: false,
  });

  const scrollParentRef = useRef<HTMLDivElement>(null);

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
        if (assessment.assessment_id !== currentAssessmentId) {
          assessmentMap.set(assessment.assessment_id, {
            id: assessment.assessment_id,
            name: assessment.label,
            color: assessment.color,
          });
        }
      });
    });

    const sortedAssessments = Array.from(assessmentMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );

    return {
      topics: Array.from(topicMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      tags: Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      assessments: [
        { id: NOT_IN_ANY_ASSESSMENT_ID, name: 'None' } as FilterItem,
        ...sortedAssessments,
      ],
    };
  }, [courseQuestions, currentAssessmentId]);

  const filteredQuestions = useMemo(() => {
    return courseQuestions.filter((q) => {
      const searchLower = searchQuery.toLowerCase().trim();

      const matchesSearch =
        !searchLower ||
        rankItem(q.qid, searchLower).passed ||
        rankItem(q.title, searchLower).passed;

      const matchesTopic = selectedTopics.size === 0 || selectedTopics.has(String(q.topic.id));

      const matchesTags =
        selectedTags.size === 0 || q.tags?.some((tag) => selectedTags.has(String(tag.id)));

      let matchesAssessment = selectedAssessments.size === 0;
      if (!matchesAssessment) {
        const filteredAssessments = (q.assessments ?? []).filter(
          (a) => a.assessment_id !== currentAssessmentId,
        );
        const hasNoAssessments = filteredAssessments.length === 0;
        const notInAnySelected = selectedAssessments.has(NOT_IN_ANY_ASSESSMENT_ID);

        if (notInAnySelected && hasNoAssessments) {
          matchesAssessment = true;
        } else {
          matchesAssessment = filteredAssessments.some((a) =>
            selectedAssessments.has(a.assessment_id),
          );
        }
      }

      const matchesGradingMethod =
        selectedGradingMethods.size === 0 || selectedGradingMethods.has(q.grading_method);

      return (
        matchesSearch && matchesTopic && matchesTags && matchesAssessment && matchesGradingMethod
      );
    });
  }, [
    courseQuestions,
    searchQuery,
    selectedTopics,
    selectedTags,
    selectedAssessments,
    selectedGradingMethods,
    currentAssessmentId,
  ]);

  const sortedQuestions = useMemo(
    () =>
      [...filteredQuestions].sort((a, b) =>
        a.qid.localeCompare(b.qid, undefined, { numeric: true }),
      ),
    [filteredQuestions],
  );

  const rowVirtualizer = useVirtualizer({
    count: sortedQuestions.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 95,
    overscan: 10,
    getItemKey: (index) => sortedQuestions[index].qid,
  });

  const handleSelect = (question: CourseQuestionForPicker) => {
    onQuestionSelected(question.qid);
  };

  const handleSelectShared = (result: QuestionByQidResult) => {
    onQuestionSelected(`@${result.course.sharing_name}/${result.question.qid}`);
  };

  const clearFilters = () => {
    setSelectedTopics(new Set());
    setSelectedTags(new Set());
    setSelectedAssessments(new Set());
    setSelectedGradingMethods(new Set());
  };

  const hasActiveFilters =
    selectedTopics.size > 0 ||
    selectedTags.size > 0 ||
    selectedAssessments.size > 0 ||
    selectedGradingMethods.size > 0;

  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (isLoading) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center py-5">
        <div className="spinner-border text-primary mb-3" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="text-muted">Loading questions...</span>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column h-100">
      <div className="p-2 border-bottom">
        <input
          type="text"
          className="form-control form-control-sm mb-2"
          placeholder="Search by QID or title..."
          aria-label="Search by QID or title"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="d-flex gap-1 flex-wrap">
          <FilterDropdown
            label="Topic"
            items={topics}
            selectedIds={selectedTopics}
            maxHeight={20 * 28 + 50}
            onChange={setSelectedTopics}
          />
          <FilterDropdown
            label="Tags"
            items={tags}
            selectedIds={selectedTags}
            maxHeight={20 * 28 + 50}
            onChange={setSelectedTags}
          />
          <FilterDropdown
            label="Assessment"
            items={assessments}
            selectedIds={selectedAssessments}
            pinnedIds={PINNED_ASSESSMENT_IDS}
            maxHeight={20 * 28 + 50}
            onChange={setSelectedAssessments}
          />
          <FilterDropdown
            label="Grading"
            items={GRADING_METHOD_ITEMS}
            selectedIds={selectedGradingMethods}
            onChange={setSelectedGradingMethods}
          />
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-sm btn-link text-decoration-none p-0"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
      {pickerError && (
        <div className="alert alert-danger small mx-2 mt-2 mb-0" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
          {pickerError.message || 'Failed to add question. Please try again.'}
        </div>
      )}
      {!sharedQuestionMode && (
        <div className="px-2 py-1 bg-light border-bottom text-muted small">
          {sortedQuestions.length} {sortedQuestions.length === 1 ? 'question' : 'questions'} found
        </div>
      )}
      <div ref={scrollParentRef} className="flex-grow-1" style={{ overflow: 'auto' }}>
        {sharedQuestionMode ? (
          sharedQuestionQuery.isFetching ? (
            <div className="d-flex align-items-center justify-content-center py-5 text-muted">
              <div className="spinner-border spinner-border-sm me-2" role="status">
                <span className="visually-hidden">Searching...</span>
              </div>
              Searching...
            </div>
          ) : sharedQuestionQuery.data ? (
            run(() => {
              const result = sharedQuestionQuery.data;
              const qid = `@${result.course.sharing_name}/${result.question.qid}`;
              const hasTitle = !!result.question.title?.trim();
              const isCurrentChange = currentChangeQid === qid;
              const isDisabled = (disabledQids.has(qid) && !isCurrentChange) || !!isPickingQuestion;
              return (
                <div
                  role={isDisabled ? undefined : 'button'}
                  tabIndex={isDisabled ? undefined : 0}
                  aria-label={hasTitle ? `${qid}: ${result.question.title}` : qid}
                  aria-disabled={isDisabled || undefined}
                  className="d-flex align-items-center px-2 py-1 border-bottom list-group-item-action picker-row"
                  style={{
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    opacity: isDisabled ? 0.5 : undefined,
                  }}
                  onClick={isDisabled ? undefined : () => handleSelectShared(result)}
                  onKeyDown={
                    isDisabled
                      ? undefined
                      : (e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectShared(result);
                          }
                        }
                  }
                >
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="d-flex align-items-center gap-1">
                      <code className="small">{qid}</code>
                      <span
                        className="badge bg-light text-muted border"
                        style={{ fontSize: '0.65rem' }}
                      >
                        {result.course.short_name}
                      </span>
                    </div>
                    {hasTitle && <div className="text-truncate small">{result.question.title}</div>}
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      <QuestionTopicTagBadges
                        topic={result.topic}
                        tags={result.tags}
                        qid={qid}
                        isExpanded={expandedTagsQids.has(qid)}
                        setExpandedQids={setExpandedTagsQids}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          ) : sharedQuestionQuery.isError ? (
            sharedQuestionQuery.error instanceof TRPCClientError &&
            sharedQuestionQuery.error.data?.code === 'NOT_FOUND' ? (
              <div className="d-flex flex-column align-items-center justify-content-center text-muted py-5 text-center px-3">
                <i className="bi bi-search display-6 mb-2" aria-hidden="true" />
                <p className="mb-1">Shared question not found.</p>
              </div>
            ) : (
              <div className="d-flex flex-column align-items-center justify-content-center text-danger py-5 text-center px-3">
                <i className="bi bi-exclamation-circle display-6 mb-2" aria-hidden="true" />
                <p className="mb-1">Failed to search for a shared question. Try again.</p>
              </div>
            )
          ) : (
            <div className="d-flex flex-column align-items-center justify-content-center text-muted py-5 text-center px-3">
              <i className="bi bi-share display-6 mb-2" aria-hidden="true" />
              <p className="mb-1">To add a shared question, enter its exact reference:</p>
              <code>@&lt;sharing-name&gt;/&lt;qid&gt;</code>
            </div>
          )
        ) : sortedQuestions.length === 0 ? (
          <div className="d-flex flex-column align-items-center justify-content-center text-muted py-5 text-center px-3">
            <i className="bi bi-search display-6 mb-2" aria-hidden="true" />
            <p className="mb-1">No questions match your search criteria.</p>
            <small>
              <a
                href={getQuestionCreateUrl(courseInstanceId)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Create a new question
              </a>
            </small>
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
              const hasTitle = !!question.title?.trim();
              const accessibleLabel = hasTitle ? `${qid}: ${question.title}` : qid;
              const addedZoneNames = questionsInAssessment.get(qid);
              const isInAssessment = addedZoneNames != null;
              const isCurrentChange = currentChangeQid === qid;
              const isDisabled = (disabledQids.has(qid) && !isCurrentChange) || !!isPickingQuestion;

              const assessmentsToShow =
                question.assessments?.filter((a) => a.assessment_id !== currentAssessmentId) ?? [];

              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  role={isDisabled ? undefined : 'button'}
                  tabIndex={isDisabled ? undefined : 0}
                  aria-label={`${accessibleLabel}${isCurrentChange ? ' (current)' : isInAssessment ? ` (in ${addedZoneNames.join(', ')})` : ''}`}
                  aria-disabled={isDisabled || undefined}
                  className="d-flex align-items-center px-2 py-1 border-bottom list-group-item-action picker-row"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    opacity: isDisabled ? 0.5 : undefined,
                    borderLeft: isCurrentChange
                      ? '3px solid var(--bs-primary)'
                      : isInAssessment
                        ? '3px solid var(--bs-secondary)'
                        : undefined,
                    backgroundColor: isCurrentChange ? 'var(--bs-primary-bg-subtle)' : undefined,
                  }}
                  onClick={isDisabled ? undefined : () => handleSelect(question)}
                  onKeyDown={
                    isDisabled
                      ? undefined
                      : (e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelect(question);
                          }
                        }
                  }
                >
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="d-flex align-items-center gap-1">
                      <a
                        href={getQuestionUrl({ courseId, questionId: question.id })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <code className="small">{qid}</code>
                      </a>
                      {isInAssessment && (
                        <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>
                          {addedZoneNames.join(', ')}
                        </span>
                      )}
                    </div>
                    {hasTitle && <div className="text-truncate small">{question.title}</div>}
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      <QuestionTopicTagBadges
                        topic={question.topic}
                        tags={question.tags}
                        qid={qid}
                        isExpanded={expandedTagsQids.has(qid)}
                        setExpandedQids={setExpandedTagsQids}
                      />
                    </div>
                    {assessmentsToShow.length > 0 && (
                      <div className="d-flex flex-wrap gap-1 mt-1">
                        <AssessmentBadges
                          assessments={assessmentsToShow}
                          courseInstanceId={courseInstanceId}
                        />
                      </div>
                    )}
                  </div>
                  {isInAssessment && (
                    <button
                      type="button"
                      className="btn btn-sm border-0 text-muted ms-1 picker-delete-btn hover-show"
                      aria-label={`Remove ${qid} from assessment`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveQuestionByQid(qid);
                      }}
                    >
                      <i className="bi bi-trash3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
