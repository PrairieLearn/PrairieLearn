import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';

import { FilterDropdown, type FilterItem } from '@prairielearn/ui';

import { getQuestionUrl } from '../../../../lib/client/url.js';
import type { CourseQuestionForPicker } from '../../types.js';
import { AssessmentBadges } from '../AssessmentBadges.js';
import { QuestionTopicTagBadges } from '../QuestionTopicTagBadges.js';

const NOT_IN_ANY_ASSESSMENT_ID = '__not_in_any_assessment__';
const PINNED_ASSESSMENT_IDS = new Set([NOT_IN_ANY_ASSESSMENT_ID]);

export function QuestionPickerPanel({
  courseQuestions,
  isLoading,
  questionsInAssessment,
  courseId,
  urlPrefix,
  currentAssessmentId,
  zoneName,
  onQuestionSelected,
  onDone,
}: {
  courseQuestions: CourseQuestionForPicker[];
  isLoading?: boolean;
  questionsInAssessment: Set<string>;
  courseId: string;
  urlPrefix: string;
  currentAssessmentId?: string;
  zoneName?: string;
  onQuestionSelected: (qid: string) => void;
  onDone: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(() => new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set());
  const [selectedAssessments, setSelectedAssessments] = useState<Set<string>>(() => new Set());
  const [expandedTagsQids, setExpandedTagsQids] = useState<Set<string>>(() => new Set());

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
        q.qid.toLowerCase().includes(searchLower) ||
        q.title.toLowerCase().includes(searchLower);

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

      return matchesSearch && matchesTopic && matchesTags && matchesAssessment;
    });
  }, [
    courseQuestions,
    searchQuery,
    selectedTopics,
    selectedTags,
    selectedAssessments,
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
    estimateSize: () => 68,
    overscan: 10,
    getItemKey: (index) => sortedQuestions[index].qid,
  });

  const handleSelect = (question: CourseQuestionForPicker) => {
    if (questionsInAssessment.has(question.qid)) return;
    onQuestionSelected(question.qid);
  };

  const clearFilters = () => {
    setSelectedTopics(new Set());
    setSelectedTags(new Set());
    setSelectedAssessments(new Set());
  };

  const hasActiveFilters =
    selectedTopics.size > 0 || selectedTags.size > 0 || selectedAssessments.size > 0;

  const virtualRows = rowVirtualizer.getVirtualItems();

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
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h6 className="mb-0">{zoneName ? `Adding to ${zoneName}` : 'Select question'}</h6>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onDone}>
            Done
          </button>
        </div>
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
      {searchQuery.trimStart().startsWith('@') && (
        <div className="alert alert-warning small mx-2 mt-2 mb-0" role="alert">
          <i className="bi bi-info-circle me-1" aria-hidden="true" />
          Shared questions from other courses are not yet searchable here.
        </div>
      )}
      <div className="px-2 py-1 bg-light border-bottom text-muted small">
        {sortedQuestions.length} {sortedQuestions.length === 1 ? 'question' : 'questions'} found
      </div>
      <div ref={scrollParentRef} className="flex-grow-1" style={{ overflow: 'auto' }}>
        {sortedQuestions.length === 0 ? (
          <div className="d-flex flex-column align-items-center justify-content-center text-muted py-5">
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
              const isAlreadyAdded = questionsInAssessment.has(qid);

              const assessmentsToShow =
                question.assessments?.filter((a) => a.assessment_id !== currentAssessmentId) ?? [];

              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  role="button"
                  tabIndex={isAlreadyAdded ? -1 : 0}
                  aria-label={`${qid}: ${question.title}${isAlreadyAdded ? ' (already added)' : ''}`}
                  className={clsx(
                    'd-flex align-items-start gap-2 px-2 py-1 border-bottom',
                    isAlreadyAdded ? 'bg-light text-muted' : 'list-group-item-action',
                  )}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    cursor: isAlreadyAdded ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
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
                      {isAlreadyAdded && (
                        <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>
                          Added
                        </span>
                      )}
                    </div>
                    <div className="text-truncate small">{question.title}</div>
                    {assessmentsToShow.length > 0 && (
                      <div className="d-flex flex-wrap gap-1 mt-1">
                        <AssessmentBadges assessments={assessmentsToShow} urlPrefix={urlPrefix} />
                      </div>
                    )}
                  </div>
                  <div
                    className="d-flex flex-wrap gap-1 justify-content-end"
                    style={{ maxWidth: '35%' }}
                  >
                    <QuestionTopicTagBadges
                      topic={question.topic}
                      tags={question.tags}
                      qid={qid}
                      isExpanded={expandedTagsQids.has(qid)}
                      setExpandedQids={setExpandedTagsQids}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
