import type { ReactNode } from 'react';

export function ToolCallGroup({ count, children }: { count: number; children: ReactNode }) {
  return (
    <details className="mb-2">
      <summary>
        {count} tool {count === 1 ? 'call' : 'calls'}
      </summary>
      {children}
    </details>
  );
}
