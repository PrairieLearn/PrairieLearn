import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

export function CopyButton({
  text,
  tooltipId,
  ariaLabel = 'Copy',
  className,
  onClick,
}: {
  text: string;
  tooltipId: string;
  ariaLabel?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
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
    timerRef.current = setTimeout(() => setCopied(false), 1500);
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
          onClick?.(e);
          void handleCopy();
        }}
      >
        <i className={copied ? 'bi bi-check' : 'bi bi-copy'} />
      </button>
    </OverlayTrigger>
  );
}
