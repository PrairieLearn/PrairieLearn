import { useCallback, useEffect, useRef, useState } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

export function CopyButton({
  text,
  tooltipId,
  ariaLabel = 'Copy',
}: {
  text: string;
  tooltipId: string;
  ariaLabel?: string;
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
        className="btn btn-xs btn-ghost me-1"
        aria-label={ariaLabel}
        onClick={handleCopy}
      >
        <i className={copied ? 'bi bi-check' : 'bi bi-copy'} />
      </button>
    </OverlayTrigger>
  );
}
