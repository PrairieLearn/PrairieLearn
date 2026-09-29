import type { ReactNode } from 'react';

import { ActivityStatus } from './ActivityStatus.js';

export function ToolCall({
  title,
  state,
  children,
  collapsible = true,
  showSpinner,
}: {
  title: ReactNode;
  state: 'streaming' | 'success' | 'error';
  children?: ReactNode;
  collapsible?: boolean;
  showSpinner?: boolean;
}) {
  const status = <ActivityStatus state={state} statusText={title} showSpinner={showSpinner} />;
  return collapsible ? (
    <details className="border rounded p-2 mb-2">
      <summary>{status}</summary>
      <div className="mt-2">{children}</div>
    </details>
  ) : (
    <div>
      {status}
      {children}
    </div>
  );
}
