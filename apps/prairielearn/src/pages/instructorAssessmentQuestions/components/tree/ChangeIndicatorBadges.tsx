import { Popover } from '@prairielearn/ui';

import { isRenderableComment } from '../../../../lib/comments.js';
import type { ChangeTrackingResult } from '../../types.js';
import { commentToString } from '../../utils/formHelpers.js';

const COMMENT_TOOLTIP_MAX_LENGTH = 200;

function truncateWithEllipsis(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '…';
}

export function ChangeIndicatorBadges({
  trackingId,
  comment,
  editMode,
  changeTracking,
}: {
  trackingId: string;
  comment: string | string[] | Record<string, unknown> | null | undefined;
  editMode: boolean;
  changeTracking: ChangeTrackingResult;
}) {
  return (
    <>
      {editMode && changeTracking.newIds.has(trackingId) && (
        <span className="text-primary ms-1" role="img" aria-label="New">
          ●
        </span>
      )}
      {editMode && changeTracking.modifiedIds.has(trackingId) && (
        <span className="text-primary ms-1" role="img" aria-label="Modified">
          ●
        </span>
      )}
      {isRenderableComment(comment) && (
        <Popover
          content={truncateWithEllipsis(commentToString(comment) ?? '', COMMENT_TOOLTIP_MAX_LENGTH)}
          placement="top"
        >
          <button
            type="button"
            className="btn btn-xs btn-ghost btn-icon border-0 ms-1"
            aria-label="View comment"
          >
            <i className="bi bi-chat-left-text text-muted" aria-hidden="true" />
          </button>
        </Popover>
      )}
    </>
  );
}
