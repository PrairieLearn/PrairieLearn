import clsx from 'clsx';

export function CollapseToggleButton({
  isCollapsed,
  ariaLabel,
  onToggle,
}: {
  isCollapsed: boolean;
  ariaLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-sm p-0 border-0 me-1"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <i
        className={clsx('bi', isCollapsed ? 'bi-chevron-right' : 'bi-chevron-down')}
        aria-hidden="true"
      />
    </button>
  );
}
