import { OverlayTrigger } from '@prairielearn/ui';

export function WarningIndicator({
  tooltipId,
  label,
  body,
}: {
  tooltipId: string;
  label: string;
  body: string;
}) {
  return (
    <OverlayTrigger
      placement="top"
      tooltip={{
        props: { id: tooltipId },
        body,
      }}
    >
      <button type="button" className="btn btn-badge color-yellow2" aria-label={body}>
        <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
        {label}
      </button>
    </OverlayTrigger>
  );
}
