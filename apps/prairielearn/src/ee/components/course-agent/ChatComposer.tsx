import type { ReactNode } from 'react';

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  isGenerating,
  onStop,
  footer,
  disclaimer,
  label = 'Modification instructions',
  sendLabel = 'Send prompt',
  textareaClassName = 'form-control mb-2',
  placeholder = 'Ask anything...',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  disabled: boolean;
  isGenerating: boolean;
  onStop?: () => void;
  footer?: ReactNode;
  disclaimer?: ReactNode;
  label?: string;
  sendLabel?: string;
  textareaClassName?: string;
  placeholder?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();

        // Forbid sending a new message while generation is in progress. The user
        // must hit "stop" first to stop generation.
        if (isGenerating || disabled) return;

        const trimmedInput = value.trim();
        if (trimmedInput) {
          onSubmit(trimmedInput);
        }
      }}
    >
      <textarea
        className={textareaClassName}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        required
        onInput={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.closest('form')?.requestSubmit();
          }
        }}
      />
      <div className="d-flex flex-row gap-2 justify-content-between align-items-center">
        {footer}

        {isGenerating && onStop ? (
          <button
            type="button"
            aria-label="Stop generation"
            className="btn btn-outline-danger btn-sm text-nowrap"
            onClick={onStop}
          >
            <i className="bi bi-stop-fill me-1" />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={disabled || isGenerating || value.trim().length === 0}
            aria-label={sendLabel}
          >
            <i className="bi bi-send-fill" />
          </button>
        )}
      </div>
      {disclaimer && <div className="text-muted small text-center mt-1">{disclaimer}</div>}
    </form>
  );
}
