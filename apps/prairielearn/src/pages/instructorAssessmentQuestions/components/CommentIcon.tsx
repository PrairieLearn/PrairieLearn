// Similar to CommentPopover.tsx
import { useId } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

import type { CommentJson } from '../../../schemas/comment.js';

/**
 * Formats a comment for display. Comments can be strings, arrays, or objects.
 */
function formatComment(comment: CommentJson): string {
  if (typeof comment === 'string') {
    return comment;
  }
  if (Array.isArray(comment)) {
    return comment
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join(' ');
  }
  return JSON.stringify(comment);
}

/**
 * Displays a comment icon with a tooltip showing the comment text.
 * Only renders if a comment is present.
 */
export function CommentIcon({ comment }: { comment: CommentJson | undefined }) {
  const tooltipId = useId();
  if (!comment) return null;

  const commentText = formatComment(comment);

  return (
    <OverlayTrigger
      placement="top"
      tooltip={{
        props: { id: tooltipId, style: { maxWidth: '300px' } },
        body: commentText,
      }}
    >
      <i
        className="bi bi-sticky text-muted ms-2"
        role="img"
        aria-label={`Comment: ${commentText}`}
      />
    </OverlayTrigger>
  );
}
