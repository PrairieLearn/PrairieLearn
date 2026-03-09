import clsx from 'clsx';
import type { ReactNode } from 'react';

export function DetailSectionHeader({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <div className={clsx(!first && 'border-top mt-3', 'pt-3')}>
      <div className="fw-bold mb-3" style={{ fontSize: '1.1rem' }}>
        {children}
      </div>
    </div>
  );
}
