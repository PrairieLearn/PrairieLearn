import clsx from 'clsx';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

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
  const tooltipId = useId();

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
    <OverlayTrigger
      tooltip={{
        body: copied ? 'Copied!' : 'Copy',
        props: { id: tooltipId },
      }}
    >
      <button
        type="button"
        className={clsx('btn', className)}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          void handleCopy();
        }}
      >
        <i className={copied ? 'bi bi-check' : 'bi bi-clipboard'} /> {label}
      </button>
    </OverlayTrigger>
  );
}
