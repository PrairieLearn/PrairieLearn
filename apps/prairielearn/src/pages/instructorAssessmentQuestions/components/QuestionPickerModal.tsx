import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import { Modal } from 'react-bootstrap';

import type { CourseQuestionForPicker } from '../types.js';

import { FilterDropdown, type FilterItem } from './FilterDropdown.js';

export interface QuestionPickerModalProps {
  show: boolean;
  onHide: () => void;
  onExited: () => void;
  onQuestionSelected: (qid: string) => void;
  courseQuestions: CourseQuestionForPicker[];
  questionsInAssessment: Set<string>;
}

/**
 * Modal for picking a question to add to an assessment.
 * Features search, topic/tag filters, and a virtualized list.
 */
export function QuestionPickerModal({
  show,
  onHide,
  onExited,
  onQuestionSelected,
  courseQuestions,
  questionsInAssessment,
}: QuestionPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(() => new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set());

  const parentRef = useRef<HTMLDivElement>(null);

  // Extract unique topics and tags from course questions
  const { topics, tags } = useMemo(() => {
    const topicMap = new Map<string, FilterItem>();
    const tagMap = new Map<string, FilterItem>();

    courseQuestions.forEach((q) => {
      const t = q.topic;
      topicMap.set(String(t.id), { id: String(t.id), name: t.name, color: t.color });
      q.tags?.forEach((tag) => {
        tagMap.set(String(tag.id), { id: String(tag.id), name: tag.name, color: tag.color });
      });
    });

    return {
      topics: Array.from(topicMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      tags: Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [courseQuestions]);

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

      return matchesSearch && matchesTopic && matchesTags;
    });
  }, [courseQuestions, searchQuery, selectedTopics, selectedTags]);

  // Sort filtered questions by QID
  const sortedQuestions = useMemo(
    () => [...filteredQuestions].sort((a, b) => a.qid.localeCompare(b.qid)),
    [filteredQuestions],
  );

  // Virtual scrolling setup
  const rowVirtualizer = useVirtualizer({
    count: sortedQuestions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const handleSelect = (question: CourseQuestionForPicker) => {
    const qid = question.qid;
    if (questionsInAssessment.has(qid)) {
      return; // Don't allow selecting already-added questions
    }
    onQuestionSelected(qid);
    resetFilters();
    onHide();
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedTopics(new Set());
    setSelectedTags(new Set());
  };

  const handleExited = () => {
    resetFilters();
    onExited();
  };

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <Modal show={show} size="lg" onHide={onHide} onExited={handleExited}>
      <Modal.Header closeButton>
        <Modal.Title>Select question</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
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
              onChange={setSelectedTopics}
            />
            <FilterDropdown
              label="Tags"
              items={tags}
              selectedIds={selectedTags}
              onChange={setSelectedTags}
            />
            {(selectedTopics.size > 0 || selectedTags.size > 0) && (
              <button
                type="button"
                className="btn btn-sm btn-link text-decoration-none"
                onClick={() => {
                  setSelectedTopics(new Set());
                  setSelectedTags(new Set());
                }}
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
        <div className="px-3 py-2 bg-light border-bottom text-muted small">
          {sortedQuestions.length} {sortedQuestions.length === 1 ? 'question' : 'questions'} found
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
                const isAlreadyAdded = questionsInAssessment.has(qid);

                return (
                  <div
                    key={virtualRow.key}
                    role="button"
                    tabIndex={isAlreadyAdded ? -1 : 0}
                    className={clsx(
                      'd-flex align-items-center gap-2 px-3 py-2 border-bottom',
                      isAlreadyAdded ? 'bg-light text-muted' : 'cursor-pointer question-picker-row',
                    )}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
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
                        <code className="text-nowrap">{qid}</code>
                        {isAlreadyAdded && (
                          <span className="badge bg-secondary">Already added</span>
                        )}
                      </div>
                      <div className="text-truncate small">{question.title}</div>
                    </div>
                    <div
                      className="d-flex flex-wrap gap-1 justify-content-end"
                      style={{ maxWidth: '40%' }}
                    >
                      <span className={`badge color-${question.topic.color}`}>
                        {question.topic.name}
                      </span>
                      {question.tags?.slice(0, 3).map((tag) => (
                        <span key={tag.id} className={`badge color-${tag.color}`}>
                          {tag.name}
                        </span>
                      ))}
                      {(question.tags?.length ?? 0) > 3 && (
                        <span className="badge bg-secondary">
                          +{(question.tags?.length ?? 0) - 3}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          Cancel
        </button>
      </Modal.Footer>
    </Modal>
  );
}
