import type { ReactNode } from 'react';

import type { StaffStudentLabel } from '../lib/client/safe-db-types.js';

export function StudentLabelBadge({
  label,
  href,
  children,
}: {
  label: StaffStudentLabel;
  href?: string;
  children?: ReactNode;
}) {
  const className = `badge color-${label.color}${children ? ' d-inline-flex align-items-center gap-1' : ''}`;

  if (href) {
    return (
      <a href={href} className={`${className} text-decoration-none`}>
        {label.name}
      </a>
    );
  }

  return (
    <span className={className}>
      {label.name}
      {children}
    </span>
  );
}
