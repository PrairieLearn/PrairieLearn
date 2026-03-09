import { useId } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

import { isRenderableComment } from '../../../../lib/comments.js';
import type { ChangeTrackingResult } from '../../types.js';

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
          <span className="text-primary ms-1">●</span>
        </OverlayTrigger>
      )}
      {editMode && changeTracking.modifiedIds.has(trackingId) && (
        <OverlayTrigger
          placement="top"
          tooltip={{ props: { id: changeTooltipId }, body: 'Modified' }}
        >
          <span className="text-primary ms-1">●</span>
        </OverlayTrigger>
      )}
      {isRenderableComment(comment) && (
        <OverlayTrigger
          placement="top"
          tooltip={{
            props: { id: commentTooltipId },
            body: typeof comment === 'string' ? comment : JSON.stringify(comment, null, 2),
          }}
        >
          <i className="bi bi-chat-left-text text-muted ms-1" aria-hidden="true" />
        </OverlayTrigger>
      )}
    </>
  );
}
