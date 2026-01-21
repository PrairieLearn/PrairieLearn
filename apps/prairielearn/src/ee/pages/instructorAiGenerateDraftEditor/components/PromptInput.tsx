import { useState } from 'react';

export function PromptInput({
  sendMessage,
  disabled,
  isGenerating,
  onStop,
  loadNewVariantAfterChanges,
  setLoadNewVariantAfterChanges,
}: {
  sendMessage: (message: { text: string }) => void;
  disabled: boolean;
  isGenerating: boolean;
  onStop: () => void;
  loadNewVariantAfterChanges?: boolean;
  setLoadNewVariantAfterChanges?: (value: boolean) => void;
}) {
  const [input, setInput] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();

        // Forbid sending a new message while generation is in progress. The user
        // must hit "stop" first to stop generation.
        if (isGenerating) return;

        const trimmedInput = input.trim();
        if (trimmedInput) {
          sendMessage({ text: trimmedInput });
          setInput('');
        }
      }}
    >
      <textarea
        id="user-prompt-llm"
        className="form-control mb-2"
        placeholder="Ask anything..."
        aria-label="Modification instructions"
        value={input}
        required
        onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
        onKeyPress={(e) => {
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
            id="new-variant-after-changes"
            checked={loadNewVariantAfterChanges}
            onChange={(e) => setLoadNewVariantAfterChanges?.(e.currentTarget.checked)}
          />
          <label className="form-check-label small text-muted" htmlFor="new-variant-after-changes">
            Load new variant after changes
          </label>
        </div>

        {isGenerating ? (
          <button
            type="button"
            aria-label="Stop generation"
            className="btn btn-outline-danger btn-sm"
            onClick={onStop}
          >
            <i className="bi bi-stop-fill me-1" />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={disabled || input.trim().length === 0}
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
