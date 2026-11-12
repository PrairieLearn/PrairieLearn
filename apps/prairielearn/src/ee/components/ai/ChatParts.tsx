import type { ReasoningUIPart, TextUIPart } from 'ai';
import clsx from 'clsx';
import { type ReactNode, useId, useState } from 'react';
import type { UrlTransform } from 'react-markdown';

import { MemoizedMarkdown } from './MemoizedMarkdown.js';

/** A chevron and summary that show or hide the details beneath them. */
export function Disclosure({
  summary,
  expanded,
  onToggle,
  className,
  children,
}: {
  summary: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  const detailsId = useId();
  return (
    <div className={className}>
      <button
        type="button"
        className="d-flex align-items-center gap-2 w-100 btn btn-link p-0 text-decoration-none text-start text-body-secondary"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        <i
          className={clsx(
            'bi small flex-shrink-0',
            expanded ? 'bi-chevron-down' : 'bi-chevron-right',
          )}
          aria-hidden="true"
        />
        {summary}
      </button>
      {expanded && <div id={detailsId}>{children}</div>}
    </div>
  );
}

export function ReasoningBlock({ part }: { part: ReasoningUIPart }) {
  // Track whether the user has explicitly interacted with the expand/collapse
  const [userControlled, setUserControlled] = useState(false);
  const [userExpanded, setUserExpanded] = useState(false);

  const isStreaming = part.state === 'streaming';

  // If user has taken control, use their preference. Otherwise, expand while streaming, collapse when done.
  const isExpanded = userControlled ? userExpanded : isStreaming;

  if (!part.text) return null;

  return (
    <Disclosure
      className="d-flex flex-column gap-1 border rounded p-1 small"
      summary={<span className="small">{isStreaming ? 'Thinking...' : 'Thinking'}</span>}
      expanded={isExpanded}
      onToggle={() => {
        setUserControlled(true);
        setUserExpanded(!isExpanded);
      }}
    >
      <div className="markdown-body reasoning-body p-1 pt-0">
        <MemoizedMarkdown content={part.text} isStreaming={isStreaming} />
      </div>
    </Disclosure>
  );
}

export function TextPart({
  part,
  urlTransform,
}: {
  part: TextUIPart;
  urlTransform?: UrlTransform;
}) {
  return (
    <div className="markdown-body">
      <MemoizedMarkdown
        content={part.text}
        urlTransform={urlTransform}
        isStreaming={part.state === 'streaming'}
      />
    </div>
  );
}
