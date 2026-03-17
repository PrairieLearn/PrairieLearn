export function AgentGradingPromptInput({
  value,
  onChange,
  onSubmit,
  disabled,
  isGenerating,
  onStop,
  placeholder = 'Ask anything...',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  disabled: boolean;
  isGenerating: boolean;
  onStop: () => void;
  placeholder?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isGenerating) return;

        const trimmedInput = value.trim();
        if (trimmedInput) {
          onSubmit(trimmedInput);
        }
      }}
    >
      <textarea
        className="form-control mb-2"
        placeholder={placeholder}
        aria-label="Grading instructions"
        value={value}
        required
        onInput={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.closest('form')?.requestSubmit();
          }
        }}
      />
      <div className="d-flex flex-row gap-2 justify-content-end align-items-center">
        {isGenerating ? (
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
            disabled={disabled || value.trim().length === 0}
            aria-label="Send prompt"
          >
            <i className="bi bi-send-fill" />
          </button>
        )}
      </div>
      <div className="text-muted small text-center mt-1">
        AI can make mistakes. Review grading results.
      </div>
    </form>
  );
}
