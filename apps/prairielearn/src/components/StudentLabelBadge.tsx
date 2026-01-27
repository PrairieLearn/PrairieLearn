import type { ReactNode } from 'react';

import type { StudentLabel } from '../lib/db-types.js';

interface StudentLabelBadgeProps {
  label: Pick<StudentLabel, 'color' | 'name'>;
  href?: string;
  children?: ReactNode;
}

export function StudentLabelBadge({ label, href, children }: StudentLabelBadgeProps) {
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
