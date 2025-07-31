import type { Editor } from '@tiptap/react';
import React from 'react';

import { useTiptapEditor } from '../../../lib/hooks/use-tiptap-editor.js';
import { Button } from '../../bootstrap-ui-primitive/button/index.js';

export interface QuestionPanelButtonProps {
  editor?: Editor | null;
  className?: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children?: React.ReactNode;
}

export function isQuestionPanelActive(editor: Editor | null): boolean {
  if (!editor) return false;
  return editor.isActive('plQuestionPanel');
}

export function toggleQuestionPanel(editor: Editor | null): void {
  if (!editor) return;
  editor.chain().focus().toggleQuestionPanel().run();
}

export function isQuestionPanelButtonDisabled(
  editor: Editor | null,
  userDisabled = false,
): boolean {
  if (!editor || !editor.isEditable || userDisabled) {
    return true;
  }
  return false;
}

export const QuestionPanelButton = React.forwardRef<HTMLButtonElement, QuestionPanelButtonProps>(
  ({ editor: propEditor, className = '', disabled, onClick, children, ...buttonProps }, ref) => {
    const contextEditor = useTiptapEditor();
    const editor = propEditor ?? contextEditor;

    const isActive = isQuestionPanelActive(editor);
    const isDisabled = isQuestionPanelButtonDisabled(editor, disabled);

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);

        if (!e.defaultPrevented && !isDisabled && editor) {
          toggleQuestionPanel(editor);
        }
      },
      [onClick, isDisabled, editor],
    );

    if (!editor || !editor.isEditable) {
      return null;
    }

    return (
      <Button
        type="button"
        className={className}
        disabled={isDisabled}
        variant={isActive ? 'primary' : isDisabled ? 'secondary' : 'outline-primary'}
        role="button"
        tabIndex={-1}
        aria-label="Toggle question panel"
        aria-pressed={isActive}
        tooltip="Toggle question panel wrapper"
        onClick={handleClick}
        {...buttonProps}
        ref={ref}
      >
        {children || <span>Question Panel</span>}
      </Button>
    );
  },
);

QuestionPanelButton.displayName = 'QuestionPanelButton';

export default QuestionPanelButton;
