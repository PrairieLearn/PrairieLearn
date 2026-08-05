import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Tooltip } from '@prairielearn/ui';

export function CopyButton({
  text,
  label = '',
  ariaLabel = label || 'Copy to clipboard',
  className,
}: {
  text: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1000);
  }, [text]);

  return (
    <>
      <Tooltip content={copied ? 'Copied!' : 'Copy'}>
        <button
          type="button"
          className={clsx('btn', className)}
          aria-label={ariaLabel}
          onClick={(e) => {
            e.stopPropagation();
            void handleCopy();
          }}
        >
          <i className={copied ? 'bi bi-check' : 'bi bi-clipboard'} aria-hidden="true" /> {label}
        </button>
      </Tooltip>
      <span className="visually-hidden" role="status">
        {copied ? 'Copied.' : ''}
      </span>
    </>
  );
}
