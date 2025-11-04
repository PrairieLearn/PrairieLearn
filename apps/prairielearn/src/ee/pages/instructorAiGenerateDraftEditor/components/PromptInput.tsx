import { useState } from 'preact/hooks';

export function PromptInput({
  sendMessage,
  disabled,
}: {
  sendMessage: (message: { text: string }) => void;
  disabled: boolean;
}) {
  const [input, setInput] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmedInput = input.trim();
        if (trimmedInput) {
          sendMessage({ text: trimmedInput });
          setInput('');
        }
      }}
    >
      <textarea
        id="user-prompt-llm"
        class="form-control mb-2"
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
      <div class="d-flex flex-row gap-2 justify-content-between align-items-center">
        <div class="form-check form-switch form-check-inline">
          <input
            class="form-check-input"
            type="checkbox"
            id="new-variant-after-changes"
            defaultChecked
          />
          <label class="form-check-label small text-muted" for="new-variant-after-changes">
            Load new variant after changes
          </label>
        </div>

        <button
          type="submit"
          class="btn btn-primary btn-sm"
          disabled={disabled || input.trim().length === 0}
          aria-label="Send prompt"
        >
          <i class="bi bi-send-fill" />
        </button>
      </div>
      <div class="text-muted small text-center mt-1">
        AI can make mistakes. Review the generated question.
      </div>
    </form>
  );
}
