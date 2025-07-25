/* eslint-disable @eslint-react/hooks-extra/no-unnecessary-use-prefix */
import { type Editor, isNodeSelection } from '@tiptap/react';
import * as React from 'react';

import { Button, type ButtonProps } from '../../bootstrap-ui-primitive/button/index.js';
import { useTiptapEditor } from '../../../lib/hooks/use-tiptap-editor.js';
import { isNodeInSchema } from '../../../lib/tiptap-utils.js';

export type ListType = 'bulletList' | 'orderedList' | 'taskList';

export interface ListOption {
  label: string;
  type: ListType;
  icon: React.ElementType;
}

export interface ListButtonProps extends Omit<ButtonProps, 'type'> {
  /**
   * The TipTap editor instance.
   */
  editor?: Editor | null;
  /**
   * The type of list to toggle.
   */
  type: ListType;
  /**
   * Optional text to display alongside the icon.
   */
  text?: string;
  /**
   * Whether the button should hide when the list is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean;
}

export const listOptions: ListOption[] = [
  {
    label: 'Bullet List',
    type: 'bulletList',
    icon: ({ className }: { className: string }) => <i class={`bi bi-list-ul ${className}`} />,
  },
  {
    label: 'Ordered List',
    type: 'orderedList',
    icon: ({ className }: { className: string }) => <i class={`bi bi-list-ol ${className}`} />,
  },
  {
    label: 'Task List',
    type: 'taskList',
    icon: ({ className }: { className: string }) => <i class={`bi bi-list-check ${className}`} />,
  },
];

export const listShortcutKeys: Record<ListType, string> = {
  bulletList: 'Ctrl-Shift-8',
  orderedList: 'Ctrl-Shift-7',
  taskList: 'Ctrl-Shift-9',
};

export function canToggleList(editor: Editor | null, type: ListType): boolean {
  if (!editor) {
    return false;
  }

  switch (type) {
    case 'bulletList':
      return editor.can().toggleBulletList();
    case 'orderedList':
      return editor.can().toggleOrderedList();
    case 'taskList':
      return editor.can().toggleList('taskList', 'taskItem');
    default:
      return false;
  }
}

export function isListActive(editor: Editor | null, type: ListType): boolean {
  if (!editor) return false;

  switch (type) {
    case 'bulletList':
      return editor.isActive('bulletList');
    case 'orderedList':
      return editor.isActive('orderedList');
    case 'taskList':
      return editor.isActive('taskList');
    default:
      return false;
  }
}

export function toggleList(editor: Editor | null, type: ListType): void {
  if (!editor) return;

  switch (type) {
    case 'bulletList':
      editor.chain().focus().toggleBulletList().run();
      break;
    case 'orderedList':
      editor.chain().focus().toggleOrderedList().run();
      break;
    case 'taskList':
      editor.chain().focus().toggleList('taskList', 'taskItem').run();
      break;
  }
}

export function getListOption(type: ListType): ListOption | undefined {
  return listOptions.find((option) => option.type === type);
}

export function shouldShowListButton(params: {
  editor: Editor | null;
  type: ListType;
  hideWhenUnavailable: boolean;
  listInSchema: boolean;
}): boolean {
  const { editor, type, hideWhenUnavailable, listInSchema } = params;

  if (!listInSchema || !editor) {
    return false;
  }

  if (hideWhenUnavailable) {
    if (isNodeSelection(editor.state.selection) || !canToggleList(editor, type)) {
      return false;
    }
  }

  return true;
}

export function useListState(editor: Editor | null, type: ListType) {
  const listInSchema = isNodeInSchema(type, editor);
  const listOption = getListOption(type);
  const isActive = isListActive(editor, type);
  const shortcutKey = listShortcutKeys[type];

  return {
    listInSchema,
    listOption,
    isActive,
    shortcutKey,
  };
}

export const ListButton = React.forwardRef<HTMLButtonElement, ListButtonProps>(
  (
    {
      editor: providedEditor,
      type,
      hideWhenUnavailable = false,
      className = '',
      onClick,
      text,
      children,
      ...buttonProps
    },
    ref,
  ) => {
    const editor = useTiptapEditor(providedEditor);
    const { listInSchema, listOption, isActive, shortcutKey } = useListState(editor, type);

    const Icon =
      listOption?.icon ||
      (({ className }: { className: string }) => <i class={`bi bi-list-ul ${className}`} />);

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);

        if (!e.defaultPrevented && editor) {
          toggleList(editor, type);
        }
      },
      [onClick, editor, type],
    );

    const show = React.useMemo(() => {
      return shouldShowListButton({
        editor,
        type,
        hideWhenUnavailable,
        listInSchema,
      });
    }, [editor, type, hideWhenUnavailable, listInSchema]);

    if (!show || !editor || !editor.isEditable) {
      return null;
    }

    return (
      <Button
        type="button"
        className={className.trim()}
        variant="outline-secondary"
        role="button"
        tabIndex={-1}
        aria-label={listOption?.label || type}
        aria-pressed={isActive}
        tooltip={listOption?.label || type}
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

ListButton.displayName = 'ListButton';

export default ListButton;
