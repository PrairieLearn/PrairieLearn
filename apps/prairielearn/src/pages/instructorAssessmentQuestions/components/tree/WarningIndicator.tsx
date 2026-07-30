import { OverlayTrigger } from '@prairielearn/ui';

export function WarningIndicator({
  tooltipId,
  label,
  body,
  variant = 'warning',
}: {
  tooltipId: string;
  label: string;
  body: string;
  variant?: 'warning' | 'error';
}) {
  return (
    <OverlayTrigger
      placement="top"
      tooltip={{
        props: { id: tooltipId },
        body,
      }}
    >
      <button
        type="button"
        className={`btn btn-badge ${variant === 'error' ? 'color-red2' : 'color-yellow2'}`}
        aria-label={body}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
        }}
      >
        <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
        {label}
      </button>
    </OverlayTrigger>
  );
}
