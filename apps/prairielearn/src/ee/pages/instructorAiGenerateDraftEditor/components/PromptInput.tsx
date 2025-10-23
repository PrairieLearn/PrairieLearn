import { useState } from 'preact/hooks';
import { useStickToBottomContext } from 'use-stick-to-bottom';

export function PromptInput({
  sendMessage,
  disabled,
}: {
  sendMessage: (message: { text: string }) => void;
  disabled: boolean;
}) {
  const [input, setInput] = useState('');
  const { scrollToBottom } = useStickToBottomContext();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmedInput = input.trim();
        if (trimmedInput) {
          void scrollToBottom();
          sendMessage({ text: trimmedInput });
          setInput('');
        }
      }}
    >
      <textarea
        id="user-prompt-llm"
        class="form-control mb-2"
        placeholder="What would you like to revise?"
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
      <button
        type="submit"
        class="btn btn-dark w-100"
        disabled={disabled || input.trim().length === 0}
      >
        Revise question
      </button>
      <div class="text-muted small text-center mt-1">
        AI can make mistakes. Review the generated question.
      </div>
    </form>
  );
}
