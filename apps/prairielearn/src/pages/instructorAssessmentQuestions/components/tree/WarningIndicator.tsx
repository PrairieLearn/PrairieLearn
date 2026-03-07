import { OverlayTrigger } from '@prairielearn/ui';

export function WarningIndicator({ tooltipId, body }: { tooltipId: string; body: string }) {
  return (
    <OverlayTrigger
      placement="top"
      tooltip={{
        props: { id: tooltipId },
        body,
      }}
    >
      <i className="bi bi-exclamation-triangle-fill text-warning ms-1" aria-hidden="true" />
    </OverlayTrigger>
  );
}
