import clsx from 'clsx';
import type { ReactNode } from 'react';

export function StudentLabelBadge({
  label,
  href,
  children,
}: {
  label: { name: string; color: string };
  href?: string;
  children?: ReactNode;
}) {
  const className = clsx(
    'badge',
    `color-${label.color}`,
    children && 'd-inline-flex align-items-center gap-1',
  );

  if (href) {
    return (
      <a href={href} className={clsx(className, 'text-decoration-none')}>
        {label.name}
        {children}
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
