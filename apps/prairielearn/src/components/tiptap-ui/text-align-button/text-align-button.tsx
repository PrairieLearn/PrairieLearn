import { type ChainedCommands, type Editor } from '@tiptap/react';
import * as React from 'react';

import { Button, type ButtonProps } from '#components/bootstrap-ui-primitive/button/index.js';
import { useTiptapEditor } from '#lib/hooks/use-tiptap-editor.js';
import clsx from 'clsx';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface TextAlignButtonProps extends ButtonProps {
  /**
   * The TipTap editor instance.
   */
  editor?: Editor | null;
  /**
   * The text alignment to apply.
   */
  align: TextAlign;
  /**
   * Optional text to display alongside the icon.
   */
  text?: string;
  /**
   * Whether the button should hide when the alignment is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean;
}

export const textAlignIcons = {
  left: ({ className }: { className?: string }) => <i class={clsx(`bi bi-text-left`, className)} />,
  center: ({ className }: { className?: string }) => (
    <i class={clsx(`bi bi-text-center`, className)} />
  ),
  right: ({ className }: { className?: string }) => (
    <i class={clsx(`bi bi-text-right`, className)} />
  ),
  justify: ({ className }: { className?: string }) => (
    <i class={clsx(`bi bi-justify`, className)} />
  ),
};

export const textAlignShortcutKeys: Partial<Record<TextAlign, string>> = {
  left: 'Ctrl-Shift-l',
  center: 'Ctrl-Shift-e',
  right: 'Ctrl-Shift-r',
  justify: 'Ctrl-Shift-j',
};

export const textAlignLabels: Record<TextAlign, string> = {
  left: 'Align left',
  center: 'Align center',
  right: 'Align right',
  justify: 'Align justify',
};

export function hasSetTextAlign(commands: ChainedCommands): commands is ChainedCommands & {
  setTextAlign: (align: TextAlign) => ChainedCommands;
} {
  return 'setTextAlign' in commands;
}

export function checkTextAlignExtension(editor: Editor | null): boolean {
  if (!editor) return false;

  const hasExtension = editor.extensionManager.extensions.some(
    (extension) => extension.name === 'textAlign',
  );

  if (!hasExtension) {
    console.warn(
      'TextAlign extension is not available. ' +
        'Make sure it is included in your editor configuration.',
    );
  }

  return hasExtension;
}

export function canSetTextAlign(
  editor: Editor | null,
  align: TextAlign,
  alignAvailable: boolean,
): boolean {
  if (!editor || !alignAvailable) return false;

  try {
    return editor.can().setTextAlign(align);
  } catch {
    return false;
  }
}

export function isTextAlignActive(editor: Editor | null, align: TextAlign): boolean {
  if (!editor) return false;
  return editor.isActive({ textAlign: align });
}

export function setTextAlign(editor: Editor | null, align: TextAlign): boolean {
  if (!editor) return false;

  const chain = editor.chain().focus();
  if (hasSetTextAlign(chain)) {
    return chain.setTextAlign(align).run();
  }
  return false;
}

export function isTextAlignButtonDisabled(
  editor: Editor | null,
  alignAvailable: boolean,
  canAlign: boolean,
  userDisabled = false,
): boolean {
  if (!editor || !alignAvailable) return true;
  if (userDisabled) return true;
  if (!canAlign) return true;
  return false;
}

export function shouldShowTextAlignButton(
  editor: Editor | null,
  canAlign: boolean,
  hideWhenUnavailable: boolean,
): boolean {
  if (!editor?.isEditable) return false;
  if (hideWhenUnavailable && !canAlign) return false;
  return true;
}

export function useTextAlign(
  editor: Editor | null,
  align: TextAlign,
  disabled = false,
  hideWhenUnavailable = false,
) {
  const alignAvailable = React.useMemo(() => checkTextAlignExtension(editor), [editor]);

  const canAlign = React.useMemo(
    () => canSetTextAlign(editor, align, alignAvailable),
    [editor, align, alignAvailable],
  );

  const isDisabled = isTextAlignButtonDisabled(editor, alignAvailable, canAlign, disabled);
  const isActive = isTextAlignActive(editor, align);

  const handleAlignment = React.useCallback(() => {
    if (!alignAvailable || !editor || isDisabled) return false;
    return setTextAlign(editor, align);
  }, [alignAvailable, editor, isDisabled, align]);

  const shouldShow = React.useMemo(
    () => shouldShowTextAlignButton(editor, canAlign, hideWhenUnavailable),
    [editor, canAlign, hideWhenUnavailable],
  );

  const Icon = textAlignIcons[align];
  const shortcutKey = textAlignShortcutKeys[align];
  const label = textAlignLabels[align];

  return {
    alignAvailable,
    canAlign,
    isDisabled,
    isActive,
    handleAlignment,
    shouldShow,
    Icon,
    shortcutKey,
    label,
  };
}

export const TextAlignButton = React.forwardRef<HTMLButtonElement, TextAlignButtonProps>(
  (
    {
      editor: providedEditor,
      align,
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

    const { isDisabled, isActive, handleAlignment, shouldShow, Icon, shortcutKey, label } =
      useTextAlign(editor, align, disabled as boolean | undefined, hideWhenUnavailable);

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);

        if (!e.defaultPrevented && !disabled) {
          handleAlignment();
        }
      },
      [onClick, disabled, handleAlignment],
    );

    if (!shouldShow || !editor || !editor.isEditable) {
      return null;
    }

    return (
      <Button
        type="button"
        className={className.trim()}
        disabled={isDisabled}
        variant="outline-secondary"
        role="button"
        tabIndex={-1}
        aria-label={label}
        aria-pressed={isActive}
        tooltip={label}
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

TextAlignButton.displayName = 'TextAlignButton';

export default TextAlignButton;
