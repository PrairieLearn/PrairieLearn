import type { ReactNode } from 'react';
import { Button } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

export function ChatComposer({
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
  const { register, handleSubmit, reset, watch } = useForm({ defaultValues: { prompt: '' } });
  return (
    <form
      onSubmit={handleSubmit(({ prompt }) => {
        if (isGenerating || disabled || !prompt.trim()) return;
        onSubmit(prompt.trim());
        reset();
      })}
    >
      <textarea
        className={textareaClassName}
        placeholder={placeholder}
        aria-label={label}
        {...register('prompt')}
        defaultValue=""
        required
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
          <Button
            type="button"
            aria-label="Stop generation"
            variant="outline-danger"
            size="sm"
            className="text-nowrap"
            onClick={onStop}
          >
            <i className="bi bi-stop-fill me-1" />
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            size="sm"
            disabled={disabled || isGenerating || watch('prompt').trim().length === 0}
            aria-label={sendLabel}
          >
            <i className="bi bi-send-fill" />
          </Button>
        )}
      </div>
      {disclaimer && <div className="text-muted small text-center mt-1">{disclaimer}</div>}
    </form>
  );
}
