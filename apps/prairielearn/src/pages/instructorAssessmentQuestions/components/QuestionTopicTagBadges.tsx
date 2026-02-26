import type { Dispatch, SetStateAction } from 'react';

interface BadgeItem {
  id: string;
  name: string;
  color: string;
}

/**
 * Renders a topic badge and expandable tag badges for a question in the picker.
 * Shows up to 3 tags initially with a "+N" button to expand.
 */
export function QuestionTopicTagBadges({
  topic,
  tags,
  qid,
  isExpanded,
  setExpandedQids,
}: {
  topic: BadgeItem;
  tags: BadgeItem[] | null;
  qid: string;
  isExpanded: boolean;
  setExpandedQids: Dispatch<SetStateAction<Set<string>>>;
}) {
  const visibleTags = isExpanded ? tags : tags?.slice(0, 3);
  const hasMoreTags = (tags?.length ?? 0) > 3;

  const hiddenTagCount = (tags?.length ?? 0) - 3;

  return (
    <>
      <span className={`badge color-${topic.color}`}>{topic.name}</span>
      {visibleTags?.map((tag) => (
        <span key={tag.id} className={`badge color-${tag.color}`}>
          {tag.name}
        </span>
      ))}
      {hasMoreTags && (
        <button
          type="button"
          className="btn btn-badge color-gray2"
          aria-label={
            isExpanded
              ? 'Show fewer tags'
              : `Show ${hiddenTagCount} more ${hiddenTagCount === 1 ? 'tag' : 'tags'}`
          }
          onClick={(e) => {
            e.stopPropagation();
            setExpandedQids((prev) => {
              const next = new Set(prev);
              if (isExpanded) {
                next.delete(qid);
              } else {
                next.add(qid);
              }
              return next;
            });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
            }
          }}
        >
          <span aria-hidden="true">{isExpanded ? 'Show less' : `+${hiddenTagCount}`}</span>
        </button>
      )}
    </>
  );
}
