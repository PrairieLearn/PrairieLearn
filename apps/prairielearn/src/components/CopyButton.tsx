import clsx from 'clsx';

export function CopyButton({
  text,
  ariaLabel = 'Copy',
  className,
}: {
  text: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={clsx('btn btn-xs btn-ghost js-copy-button', className)}
      data-clipboard-text={text}
      aria-label={ariaLabel}
    >
      <i className="bi bi-clipboard" />
    </button>
  );
}
