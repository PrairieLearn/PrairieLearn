import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface StickyActionBarProps {
  /** Content displayed on the left side (e.g., status message). */
  message?: ReactNode;
  /** Content displayed on the right side (e.g., buttons). */
  actions: ReactNode;
  /** Additional CSS class names for the container. */
  className?: string;
}

export function StickyActionBar({ message, actions, className }: StickyActionBarProps) {
  return (
    <div
      className={clsx(
        'd-flex align-items-center justify-content-between px-3 py-2',
        'pl-ui-sticky-action-bar',
        className,
      )}
    >
      {/* We should consider making this more generic if it ever becomes used outside of Save & Submit use cases */}
      <div className="text-muted small">{message}</div>
      <div className="d-flex gap-2 flex-shrink-0">{actions}</div>
    </div>
  );
}
