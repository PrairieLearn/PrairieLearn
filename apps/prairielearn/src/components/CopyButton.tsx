import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

export function CopyButton({
  text,
  ariaLabel = 'Copy',
  className,
}: {
  text: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltipId] = useState(() => `copy-button-tooltip-${crypto.randomUUID()}`);

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
        className={clsx('btn btn-xs btn-ghost', className)}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          void handleCopy();
        }}
      >
        <i className={copied ? 'bi bi-check' : 'bi bi-clipboard'} />
      </button>
    </OverlayTrigger>
  );
}
