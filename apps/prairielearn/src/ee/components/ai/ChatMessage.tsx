import clsx from 'clsx';
import type { ReactNode } from 'react';

export function ChatMessage({
  messageRole,
  children,
  label,
  className,
}: {
  messageRole: 'user' | 'assistant' | 'system';
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <article
      aria-label={label ?? (messageRole === 'user' ? 'Your message' : 'Agent message')}
      className={
        className ??
        clsx('mb-3 p-3 rounded', messageRole === 'user' ? 'bg-body-secondary ms-4' : 'me-2')
      }
    >
      {children}
    </article>
  );
}
