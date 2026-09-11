import { ChatComposer } from '../../../components/chat/ChatComposer.js';

export function PromptInput({
  refreshQuestionPreviewAfterChanges,
  setRefreshQuestionPreviewAfterChanges,
  ...props
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
    <ChatComposer
      {...props}
      footer={
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
      }
      disclaimer="AI can make mistakes. Review the generated question."
    />
  );
}
