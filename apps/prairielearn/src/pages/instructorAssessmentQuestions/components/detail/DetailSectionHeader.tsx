import clsx from 'clsx';
import type { ReactNode } from 'react';

export function DetailSectionHeader({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <div
      className={clsx(
        'bg-body-tertiary border-bottom fw-bold py-2 mb-3',
        !first && 'border-top mt-3',
      )}
      style={{
        marginLeft: '-1rem',
        marginRight: '-1rem',
        paddingLeft: '1rem',
        paddingRight: '1rem',
        ...(first && { marginTop: '-1rem' }),
      }}
    >
      {children}
    </div>
  );
}
