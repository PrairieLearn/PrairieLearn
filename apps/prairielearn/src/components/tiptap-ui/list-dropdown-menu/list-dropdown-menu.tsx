import { type Editor, isNodeSelection } from '@tiptap/react';
import * as React from 'react';

import {
  ListButton,
  type ListType,
  canToggleList,
  isListActive,
  listOptions,
} from '../list-button/list-button.js';
import { Button, type ButtonProps } from '../../bootstrap-ui-primitive/button/index.js';

import { useTiptapEditor } from '../../../lib/hooks/use-tiptap-editor.js';
import { isNodeInSchema } from '../../../lib/tiptap-utils.js';
import { Dropdown, DropdownMenu } from 'react-bootstrap';

export interface ListDropdownMenuProps extends Omit<ButtonProps, 'type'> {
  /**
   * The TipTap editor instance.
   */
  editor?: Editor;
  /**
   * The list types to display in the dropdown.
   */
  types?: ListType[];
  /**
   * Whether the dropdown should be hidden when no list types are available
   * @default false
   */
  hideWhenUnavailable?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export function canToggleAnyList(editor: Editor | null, listTypes: ListType[]): boolean {
  if (!editor) return false;
  return listTypes.some((type) => canToggleList(editor, type));
}

export function isAnyListActive(editor: Editor | null, listTypes: ListType[]): boolean {
  if (!editor) return false;
  return listTypes.some((type) => isListActive(editor, type));
}

export function getFilteredListOptions(availableTypes: ListType[]): typeof listOptions {
  return listOptions.filter((option) => !option.type || availableTypes.includes(option.type));
}

export function shouldShowListDropdown(params: {
  editor: Editor | null;
  listTypes: ListType[];
  hideWhenUnavailable: boolean;
  listInSchema: boolean;
  canToggleAny: boolean;
}): boolean {
  const { editor, hideWhenUnavailable, listInSchema, canToggleAny } = params;

  if (!listInSchema || !editor) {
    return false;
  }

  if (hideWhenUnavailable) {
    if (isNodeSelection(editor.state.selection) || !canToggleAny) {
      return false;
    }
  }

  return true;
}

export function useListDropdownState(editor: Editor | null, availableTypes: ListType[]) {
  const [isOpen, setIsOpen] = React.useState(false);

  const listInSchema = availableTypes.some((type) => isNodeInSchema(type, editor));

  const filteredLists = React.useMemo(
    () => getFilteredListOptions(availableTypes),
    [availableTypes],
  );

  const canToggleAny = canToggleAnyList(editor, availableTypes);
  const isAnyActive = isAnyListActive(editor, availableTypes);

  const handleOpenChange = React.useCallback(
    (open: boolean, callback?: (isOpen: boolean) => void) => {
      setIsOpen(open);
      callback?.(open);
    },
    [],
  );

  return {
    isOpen,
    setIsOpen,
    listInSchema,
    filteredLists,
    canToggleAny,
    isAnyActive,
    handleOpenChange,
  };
}

export function useActiveListIcon(editor: Editor | null, filteredLists: typeof listOptions) {
  return React.useCallback(() => {
    const activeOption = filteredLists.find((option) => isListActive(editor, option.type));

    return activeOption ? <activeOption.icon /> : <i class="bi bi-list-ul" />;
  }, [editor, filteredLists]);
}

const DEFAULT_LIST_TYPES: ListType[] = ['bulletList', 'orderedList', 'taskList'];

export function ListDropdownMenu({
  editor: providedEditor,
  types = DEFAULT_LIST_TYPES,
  hideWhenUnavailable = false,
  onOpenChange,
  ...props
}: ListDropdownMenuProps) {
  const editor = useTiptapEditor(providedEditor);

  const { isOpen, listInSchema, filteredLists, canToggleAny, isAnyActive, handleOpenChange } =
    useListDropdownState(editor, types);

  const getActiveIcon = useActiveListIcon(editor, filteredLists);

  const show = React.useMemo(() => {
    return shouldShowListDropdown({
      editor,
      listTypes: types,
      hideWhenUnavailable,
      listInSchema,
      canToggleAny,
    });
  }, [editor, types, hideWhenUnavailable, listInSchema, canToggleAny]);

  const handleOnOpenChange = React.useCallback(
    (open: boolean) => handleOpenChange(open, onOpenChange),
    [handleOpenChange, onOpenChange],
  );

  if (!show || !editor || !editor.isEditable) {
    return null;
  }

  return (
    <Dropdown show={isOpen} onToggle={handleOnOpenChange}>
      <Dropdown.Toggle
        as={Button}
        type="button"
        variant="outline-secondary"
        role="button"
        tabIndex={-1}
        aria-label="List options"
        tooltip="List"
        {...props}
      >
        {getActiveIcon()}
        <i class="bi bi-chevron-down" />
      </Dropdown.Toggle>

      <Dropdown.Menu>
        {filteredLists.map((option) => (
          <Dropdown.Item key={option.type}>
            <ListButton
              editor={editor}
              type={option.type}
              text={option.label}
              hideWhenUnavailable={hideWhenUnavailable}
              tooltip=""
            />
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default ListDropdownMenu;
