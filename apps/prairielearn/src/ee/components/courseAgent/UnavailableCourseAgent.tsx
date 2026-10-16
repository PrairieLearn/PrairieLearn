import { Button } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

export function UnavailableCourseAgent({ reason }: { reason: string }) {
  return (
    <OverlayTrigger
      trigger={['hover', 'focus']}
      placement="top"
      tooltip={{ body: reason, props: { id: 'course-agent-unavailable' } }}
    >
      {/* Disabled buttons do not receive pointer or keyboard events; the wrapper owns the tooltip. */}
      <span
        className="course-agent-toggle"
        role="button"
        aria-label="Course agent unavailable"
        aria-disabled="true"
        tabIndex={0}
      >
        <Button
          variant="primary"
          className="w-100 h-100 rounded-circle"
          style={{ pointerEvents: 'none' }}
          aria-label="Open course agent"
          disabled
        >
          <i className="bi bi-stars" aria-hidden="true" />
        </Button>
      </span>
    </OverlayTrigger>
  );
}
