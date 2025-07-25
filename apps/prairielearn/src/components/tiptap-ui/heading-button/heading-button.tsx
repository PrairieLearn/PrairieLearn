/* eslint-disable @eslint-react/hooks-extra/no-unnecessary-use-prefix */
import { type Editor, isNodeSelection } from '@tiptap/react';
import * as React from 'react';

import { Button, type ButtonProps } from '../../bootstrap-ui-primitive/button/index.js';
import { useTiptapEditor } from '../../../lib/hooks/use-tiptap-editor.js';
import { isNodeInSchema } from '../../../lib/tiptap-utils.js';
import clsx from 'clsx';

export type Level = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingButtonProps extends Omit<ButtonProps, 'type'> {
  /**
   * The TipTap editor instance.
   */
  editor?: Editor | null;
  /**
   * The heading level.
   */
  level: Level;
  /**
   * Optional text to display alongside the icon.
   */
  text?: string;
  /**
   * Whether the button should hide when the heading is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean;
}

export const headingIcons = {
  1: ({ className }: { className?: string }) => <i class={clsx('bi bi-type-h1', className)} />,
  2: ({ className }: { className?: string }) => <i class={clsx('bi bi-type-h2', className)} />,
  3: ({ className }: { className?: string }) => <i class={clsx('bi bi-type-h3', className)} />,
  4: ({ className }: { className?: string }) => <i class={clsx('bi bi-type-h4', className)} />,
  5: ({ className }: { className?: string }) => <i class={clsx('bi bi-type-h5', className)} />,
  6: ({ className }: { className?: string }) => <i class={clsx('bi bi-type-h6', className)} />,
};

export const headingShortcutKeys: Partial<Record<Level, string>> = {
  1: 'Ctrl-Alt-1',
  2: 'Ctrl-Alt-2',
  3: 'Ctrl-Alt-3',
  4: 'Ctrl-Alt-4',
  5: 'Ctrl-Alt-5',
  6: 'Ctrl-Alt-6',
};

export function canToggleHeading(editor: Editor | null, level: Level): boolean {
  if (!editor) return false;

  try {
    return editor.can().toggleNode('heading', 'paragraph', { level });
  } catch {
    return false;
  }
}

export function isHeadingActive(editor: Editor | null, level: Level): boolean {
  if (!editor) return false;
  return editor.isActive('heading', { level });
}

export function toggleHeading(editor: Editor | null, level: Level): void {
  if (!editor) return;

  if (editor.isActive('heading', { level })) {
    editor.chain().focus().setNode('paragraph').run();
  } else {
    editor.chain().focus().toggleNode('heading', 'paragraph', { level }).run();
  }
}

export function isHeadingButtonDisabled(
  editor: Editor | null,
  level: Level,
  userDisabled = false,
): boolean {
  if (!editor) return true;
  if (userDisabled) return true;
  if (!canToggleHeading(editor, level)) return true;
  return false;
}

export function shouldShowHeadingButton(params: {
  editor: Editor | null;
  level: Level;
  hideWhenUnavailable: boolean;
  headingInSchema: boolean;
}): boolean {
  const { editor, hideWhenUnavailable, headingInSchema } = params;

  if (!headingInSchema || !editor) {
    return false;
  }

  if (hideWhenUnavailable) {
    if (isNodeSelection(editor.state.selection)) {
      return false;
    }
  }

  return true;
}

export function getFormattedHeadingName(level: Level): string {
  return `Heading ${level}`;
}

export function useHeadingState(editor: Editor | null, level: Level, disabled = false) {
  const headingInSchema = isNodeInSchema('heading', editor);
  const isDisabled = isHeadingButtonDisabled(editor, level, disabled);
  const isActive = isHeadingActive(editor, level);

  const Icon = headingIcons[level];
  const shortcutKey = headingShortcutKeys[level];
  const formattedName = getFormattedHeadingName(level);

  return {
    headingInSchema,
    isDisabled,
    isActive,
    Icon,
    shortcutKey,
    formattedName,
  };
}

export const HeadingButton = React.forwardRef<HTMLButtonElement, HeadingButtonProps>(
  (
    {
      editor: providedEditor,
      level,
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

    const { headingInSchema, isDisabled, isActive, Icon, shortcutKey, formattedName } =
      useHeadingState(editor, level, disabled as boolean | undefined);

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);

        if (!e.defaultPrevented && !isDisabled && editor) {
          toggleHeading(editor, level);
        }
      },
      [onClick, isDisabled, editor, level],
    );

    const show = React.useMemo(() => {
      return shouldShowHeadingButton({
        editor,
        level,
        hideWhenUnavailable,
        headingInSchema,
      });
    }, [editor, level, hideWhenUnavailable, headingInSchema]);

    if (!show || !editor || !editor.isEditable) {
      return null;
    }

    return (
      <Button
        type="button"
        variant="outline-secondary"
        className={className.trim()}
        disabled={isDisabled}
        role="button"
        tabIndex={-1}
        aria-label={formattedName}
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

HeadingButton.displayName = 'HeadingButton';

export default HeadingButton;
