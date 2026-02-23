import { useCallback, useState } from 'react';

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

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
