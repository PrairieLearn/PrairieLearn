import { useCallback, useRef, useState } from 'react';

export function GradingPromptInput({
  value,
  disabled,
  isGenerating,
  onChange,
  onSubmit,
  onStop,
}: {
  value: string;
  disabled: boolean;
  isGenerating: boolean;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isStopping, setIsStopping] = useState(false);

  // Reset isStopping when generation ends (render-time adjustment, not useEffect).
  if (!isGenerating && isStopping) {
    setIsStopping(false);
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && !isGenerating && value.trim().length > 0) {
          onSubmit(value);
        }
      }
    },
    [disabled, isGenerating, value, onSubmit],
  );

  return (
    <div className="d-flex flex-column gap-2">
      <textarea
        ref={textareaRef}
        className="form-control"
        rows={2}
        placeholder="Message the AI assistant..."
        value={value}
        disabled={disabled || isGenerating}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="d-flex justify-content-end">
        {isGenerating ? (
          isStopping ? (
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled>
              <span
                className="spinner-border spinner-border-sm me-1"
                role="status"
                aria-hidden="true"
              />
              Stopping...
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => {
                setIsStopping(true);
                onStop();
              }}
            >
              <i className="bi bi-stop-fill me-1" />
              Stop
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={disabled || value.trim().length === 0}
            onClick={() => onSubmit(value)}
          >
            <i className="bi bi-send me-1" />
            Send
          </button>
        )}
      </div>
    </div>
  );
}
