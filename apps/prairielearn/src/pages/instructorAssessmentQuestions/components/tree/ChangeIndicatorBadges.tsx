import { useId } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

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
  const changeTooltipId = useId();
  const commentTooltipId = useId();

  return (
    <>
      {editMode && changeTracking.newIds.has(trackingId) && (
        <OverlayTrigger placement="top" tooltip={{ props: { id: changeTooltipId }, body: 'New' }}>
          <span className="text-primary ms-1" role="img" aria-label="New">
            ●
          </span>
        </OverlayTrigger>
      )}
      {editMode && changeTracking.modifiedIds.has(trackingId) && (
        <OverlayTrigger
          placement="top"
          tooltip={{ props: { id: changeTooltipId }, body: 'Modified' }}
        >
          <span className="text-primary ms-1" role="img" aria-label="Modified">
            ●
          </span>
        </OverlayTrigger>
      )}
      {isRenderableComment(comment) && (
        <OverlayTrigger
          placement="top"
          tooltip={{
            props: { id: commentTooltipId },
            body: truncateWithEllipsis(commentToString(comment) ?? '', COMMENT_TOOLTIP_MAX_LENGTH),
          }}
        >
          <i className="bi bi-chat-left-text text-muted ms-1" aria-hidden="true" />
        </OverlayTrigger>
      )}
    </>
  );
}
