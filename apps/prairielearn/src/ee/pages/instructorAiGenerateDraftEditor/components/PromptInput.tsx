export function PromptInput({
  value,
  onChange,
  onSubmit,
  disabled,
  isGenerating,
  onStop,
  refreshQuestionPreviewAfterChanges,
  setRefreshQuestionPreviewAfterChanges,
  placeholder = 'Ask anything...',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  disabled: boolean;
  isGenerating: boolean;
  onStop: () => void;
  refreshQuestionPreviewAfterChanges: boolean;
  setRefreshQuestionPreviewAfterChanges?: (value: boolean) => void;
  placeholder?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();

        // Forbid sending a new message while generation is in progress. The user
        // must hit "stop" first to stop generation.
        if (isGenerating) return;

        const trimmedInput = value.trim();
        if (trimmedInput) {
          onSubmit(trimmedInput);
        }
      }}
    >
      <textarea
        id="user-prompt-llm"
        className="form-control mb-2"
        placeholder={placeholder}
        aria-label="Modification instructions"
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
      <div className="d-flex flex-row gap-2 justify-content-between align-items-center">
        <div className="form-check form-switch form-check-inline">
          <input
            className="form-check-input"
            type="checkbox"
            id="refresh-question-preview-after-changes"
            checked={refreshQuestionPreviewAfterChanges}
            onChange={(e) => setRefreshQuestionPreviewAfterChanges?.(e.currentTarget.checked)}
          />
          <label
            className="form-check-label small text-muted"
            htmlFor="refresh-question-preview-after-changes"
          >
            Refresh question preview after changes
          </label>
        </div>

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
        AI can make mistakes. Review the generated question.
      </div>
    </form>
  );
}
