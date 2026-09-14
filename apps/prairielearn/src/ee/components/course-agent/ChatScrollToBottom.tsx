import clsx from 'clsx';

export function ScrollToBottomButton({
  isAtBottom,
  scrollToBottom,
}: {
  isAtBottom?: boolean;
  scrollToBottom: () => void;
}) {
  return (
    !isAtBottom && (
      <button
        type="button"
        className={clsx(
          'position-absolute',
          'bottom-0',
          'start-50',
          'translate-middle',
          'rounded-circle',
          'bg-primary',
          'text-white',
          'p-2',
          'd-flex',
          'align-items-center',
          'justify-content-center',
          'border-0',
          'fs-3',
        )}
        style={{ aspectRatio: '1 / 1' }}
        aria-label="Scroll to bottom"
        onClick={() => scrollToBottom()}
      >
        <i className="bi bi-arrow-down-circle-fill lh-1" aria-hidden="true" />
      </button>
    )
  );
}
