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
      <button type="button" className="btn btn-xs btn-ghost p-0 ms-1" aria-label={body}>
        <i className="bi bi-exclamation-triangle-fill text-warning" aria-hidden="true" />
      </button>
    </OverlayTrigger>
  );
}
