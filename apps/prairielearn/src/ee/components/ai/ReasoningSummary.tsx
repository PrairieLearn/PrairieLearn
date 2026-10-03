import clsx from 'clsx';
import { useState } from 'react';

import { MemoizedMarkdown } from './MemoizedMarkdown.js';

export function ReasoningSummary({ text, state }: { text: string; state?: 'streaming' | 'done' }) {
  // Track whether the user has explicitly interacted with the expand/collapse
  const [userControlled, setUserControlled] = useState(false);
  const [userExpanded, setUserExpanded] = useState(false);

  const isStreaming = state === 'streaming';

  // If user has taken control, use their preference. Otherwise, expand while streaming, collapse when done.
  const isExpanded = userControlled ? userExpanded : isStreaming;

  if (!text) return null;

  const toggleExpanded = () => {
    setUserControlled(true);
    setUserExpanded(!isExpanded);
  };

  return (
    <div className="d-flex flex-column gap-1 border rounded p-1 small">
      <button
        type="button"
        className="d-flex flex-row gap-2 align-items-center btn btn-link text-decoration-none p-0 text-start"
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
      >
        <i
          className={clsx('bi small text-muted', {
            'bi-chevron-right': !isExpanded,
            'bi-chevron-down': isExpanded,
          })}
          aria-hidden="true"
        />
        <span className="small text-muted">{isStreaming ? 'Thinking...' : 'Thinking'}</span>
      </button>

      {isExpanded && (
        <div className="markdown-body reasoning-body p-1 pt-0">
          <MemoizedMarkdown content={text} />
        </div>
      )}
    </div>
  );
}
