import { type Editor, isNodeSelection } from '@tiptap/react';
import * as React from 'react';

import { Button, type ButtonProps } from '../../bootstrap-ui-primitive/button/index.js';
import { useTiptapEditor } from '../../../lib/hooks/use-tiptap-editor.js';
import { isNodeInSchema } from '../../../lib/tiptap-utils.js';

export interface CodeBlockButtonProps extends Omit<ButtonProps, 'type'> {
  /**
   * The TipTap editor instance.
   */
  editor?: Editor | null;
  /**
   * Optional text to display alongside the icon.
   */
  text?: string;
  /**
   * Whether the button should hide when the node is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean;
}

export function canToggleCodeBlock(editor: Editor | null): boolean {
  if (!editor) return false;

  try {
    return editor.can().toggleNode('codeBlock', 'paragraph');
  } catch {
    return false;
  }
}

export function isCodeBlockActive(editor: Editor | null): boolean {
  if (!editor) return false;
  return editor.isActive('codeBlock');
}

export function toggleCodeBlock(editor: Editor | null): boolean {
  if (!editor) return false;
  return editor.chain().focus().toggleNode('codeBlock', 'paragraph').run();
}

export function isCodeBlockButtonDisabled(
  editor: Editor | null,
  canToggle: boolean,
  userDisabled = false,
): boolean {
  if (!editor) return true;
  if (userDisabled) return true;
  if (!canToggle) return true;
  return false;
}

export function shouldShowCodeBlockButton(params: {
  editor: Editor | null;
  hideWhenUnavailable: boolean;
  nodeInSchema: boolean;
  canToggle: boolean;
}): boolean {
  const { editor, hideWhenUnavailable, nodeInSchema, canToggle } = params;

  if (!nodeInSchema || !editor) {
    return false;
  }

  if (hideWhenUnavailable) {
    if (isNodeSelection(editor.state.selection) || !canToggle) {
      return false;
    }
  }

  return Boolean(editor?.isEditable);
}

export function useCodeBlockState(
  editor: Editor | null,
  disabled = false,
  hideWhenUnavailable = false,
) {
  const nodeInSchema = isNodeInSchema('codeBlock', editor);

  const canToggle = canToggleCodeBlock(editor);
  const isDisabled = isCodeBlockButtonDisabled(editor, canToggle, disabled);
  const isActive = isCodeBlockActive(editor);

  const shouldShow = React.useMemo(
    () =>
      shouldShowCodeBlockButton({
        editor,
        hideWhenUnavailable,
        nodeInSchema,
        canToggle,
      }),
    [editor, hideWhenUnavailable, nodeInSchema, canToggle],
  );

  const handleToggle = React.useCallback(() => {
    if (!isDisabled && editor) {
      return toggleCodeBlock(editor);
    }
    return false;
  }, [editor, isDisabled]);

  const shortcutKey = 'Ctrl-Alt-c';
  const label = 'Code Block';

  return {
    nodeInSchema,
    canToggle,
    isDisabled,
    isActive,
    shouldShow,
    handleToggle,
    shortcutKey,
    label,
  };
}

export const CodeBlockButton = React.forwardRef<HTMLButtonElement, CodeBlockButtonProps>(
  (
    {
      editor: providedEditor,
      text,
      hideWhenUnavailable = false,
      className = '',
      disabled,
      onClick,
      children,
      ...buttonProps
    },
    ref,
  ) => {
    const editor = useTiptapEditor(providedEditor);

    const { isDisabled, isActive, shouldShow, handleToggle, shortcutKey, label } =
      useCodeBlockState(editor, disabled as boolean | undefined, hideWhenUnavailable);

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);

        if (!e.defaultPrevented && !isDisabled) {
          handleToggle();
        }
      },
      [onClick, isDisabled, handleToggle],
    );

    if (!shouldShow || !editor || !editor.isEditable) {
      return null;
    }

    return (
      <Button
        type="button"
        className={className.trim()}
        disabled={isDisabled}
        data-style="ghost"
        data-active-state={isActive ? 'on' : 'off'}
        data-disabled={isDisabled}
        role="button"
        tabIndex={-1}
        aria-label="codeBlock"
        aria-pressed={isActive}
        tooltip={label}
        shortcutKeys={shortcutKey}
        onClick={handleClick}
        {...buttonProps}
        ref={ref}
      >
        {children || (
          <>
            <i class="bi bi-code-square tiptap-button-icon" />
            {text && <span className="tiptap-button-text">{text}</span>}
          </>
        )}
      </Button>
    );
  },
);

CodeBlockButton.displayName = 'CodeBlockButton';

export default CodeBlockButton;
