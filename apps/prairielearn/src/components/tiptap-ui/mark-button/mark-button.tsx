/* eslint-disable react-you-might-not-need-an-effect/no-pass-live-state-to-parent */
import { type Editor, isNodeSelection } from '@tiptap/react';
import clsx from 'clsx';
import * as React from 'react';

import { useTiptapEditor } from '../../../lib/hooks/use-tiptap-editor.js';
import { isMarkInSchema } from '../../../lib/tiptap-utils.js';
import { Button, type ButtonProps } from '../../bootstrap-ui-primitive/button/index.js';

export type Mark =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'underline'
  | 'superscript'
  | 'subscript';

export interface MarkButtonProps extends Omit<ButtonProps, 'type'> {
  /**
   * The type of mark to toggle
   */
  type: Mark;
  /**
   * Display text for the button (optional)
   */
  text?: string;
  /**
   * Whether this button should be hidden when the mark is not available
   */
  hideWhenUnavailable?: boolean;
}

export const markIcons = {
  bold: ({ className }: { className?: string }) => <i class={clsx('bi bi-type-bold', className)} />,
  italic: ({ className }: { className?: string }) => (
    <i class={clsx('bi bi-type-italic', className)} />
  ),
  underline: ({ className }: { className?: string }) => (
    <i class={clsx('bi bi-type-underline', className)} />
  ),
  strike: ({ className }: { className?: string }) => (
    <i class={clsx('bi bi-type-strikethrough', className)} />
  ),
  code: ({ className }: { className?: string }) => (
    <i class={clsx('bi bi-code-slash', className)} />
  ),
  superscript: ({ className }: { className?: string }) => (
    <i class={clsx('bi bi-superscript', className)} />
  ),
  subscript: ({ className }: { className?: string }) => (
    <i class={clsx('bi bi-subscript', className)} />
  ),
};

export const markShortcutKeys: Partial<Record<Mark, string>> = {
  bold: 'Ctrl-b',
  italic: 'Ctrl-i',
  underline: 'Ctrl-u',
  strike: 'Ctrl-Shift-s',
  code: 'Ctrl-e',
  superscript: 'Ctrl-.',
  subscript: 'Ctrl-,',
};

export function canToggleMark(editor: Editor | null, type: Mark): boolean {
  if (!editor) return false;

  try {
    return editor.can().toggleMark(type);
  } catch {
    return false;
  }
}

export function isMarkActive(editor: Editor | null, type: Mark): boolean {
  if (!editor) return false;
  return editor.isActive(type);
}

export function toggleMark(editor: Editor | null, type: Mark): void {
  if (!editor) return;
  editor.chain().focus().toggleMark(type).run();
}

export function isMarkButtonDisabled(
  editor: Editor | null,
  type: Mark,
  userDisabled = false,
): boolean {
  if (!editor) return true;
  if (userDisabled) return true;
  if (editor.isActive('codeBlock')) return true;
  if (!canToggleMark(editor, type)) return true;
  return false;
}

export function shouldShowMarkButton(params: {
  editor: Editor | null;
  type: Mark;
  hideWhenUnavailable: boolean;
  markInSchema: boolean;
}): boolean {
  const { editor, type, hideWhenUnavailable, markInSchema } = params;

  if (!markInSchema || !editor) {
    return false;
  }

  if (hideWhenUnavailable) {
    if (isNodeSelection(editor.state.selection) || !canToggleMark(editor, type)) {
      return false;
    }
  }

  return true;
}

export function getFormattedMarkName(type: Mark): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function useMarkState(editor: Editor | null, type: Mark, disabled = false) {
  const markInSchema = isMarkInSchema(type, editor);
  const [isActive, setIsActive] = React.useState(() => isMarkActive(editor, type));
  const [isDisabled, setIsDisabled] = React.useState(() =>
    isMarkButtonDisabled(editor, type, disabled),
  );

  React.useEffect(() => {
    if (!editor) return;

    const updateState = () => {
      setIsActive(isMarkActive(editor, type));
      setIsDisabled(isMarkButtonDisabled(editor, type, disabled));
    };

    editor.on('selectionUpdate', updateState);
    editor.on('update', updateState);

    return () => {
      editor.off('selectionUpdate', updateState);
      editor.off('update', updateState);
    };
  }, [editor, type, disabled]);

  const Icon = markIcons[type];
  const shortcutKey = markShortcutKeys[type];
  const formattedName = getFormattedMarkName(type);

  return {
    markInSchema,
    isDisabled,
    isActive,
    Icon,
    shortcutKey,
    formattedName,
  };
}

export const MarkButton = React.forwardRef<HTMLButtonElement, MarkButtonProps>(
  (
    {
      type,
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
    const editor = useTiptapEditor();

    const { markInSchema, isDisabled, isActive, Icon, shortcutKey, formattedName } = useMarkState(
      editor,
      type,
      disabled as boolean | undefined,
    );
    console.log({ markInSchema, isDisabled, isActive });

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);

        if (!e.defaultPrevented && !isDisabled && editor) {
          toggleMark(editor, type);
        }
      },
      [onClick, isDisabled, editor, type],
    );

    const show = React.useMemo(() => {
      return shouldShowMarkButton({
        editor,
        type,
        hideWhenUnavailable,
        markInSchema,
      });
    }, [editor, type, hideWhenUnavailable, markInSchema]);

    if (!show || !editor || !editor.isEditable) {
      return null;
    }

    console.log(isActive, isDisabled);

    return (
      <Button
        type="button"
        className={className}
        disabled={isDisabled}
        variant={isActive ? 'primary' : isDisabled ? 'secondary' : 'outline-primary'}
        role="button"
        tabIndex={-1}
        aria-label={type}
        aria-pressed={isActive}
        tooltip={formattedName}
        shortcutKeys={shortcutKey}
        onClick={handleClick}
        {...buttonProps}
        ref={ref}
      >
        {children || (
          <>
            <Icon />
            {text && <span>{text}</span>}
          </>
        )}
      </Button>
    );
  },
);

MarkButton.displayName = 'MarkButton';

export default MarkButton;
