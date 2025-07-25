import { type Editor, isNodeSelection } from '@tiptap/react';
import * as React from 'react';

import {
  HeadingButton,
  type Level,
  getFormattedHeadingName,
  headingIcons,
} from '../heading-button/heading-button.js';
import { Button, type ButtonProps } from '../../bootstrap-ui-primitive/button/index.js';
import { useTiptapEditor } from '../../../lib/hooks/use-tiptap-editor.js';
import { isNodeInSchema } from '../../../lib/tiptap-utils.js';
import { Dropdown } from 'react-bootstrap';
import clsx from 'clsx';

export interface HeadingDropdownMenuProps extends Omit<ButtonProps, 'type'> {
  editor?: Editor | null;
  levels?: Level[];
  hideWhenUnavailable?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

const DEFAULT_LEVELS: Level[] = [1, 2, 3, 4, 5, 6];
export function HeadingDropdownMenu({
  editor: providedEditor,
  levels = DEFAULT_LEVELS,
  hideWhenUnavailable = false,
  onOpenChange,
  ...props
}: HeadingDropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const editor = useTiptapEditor(providedEditor);

  const headingInSchema = isNodeInSchema('heading', editor);

  const handleOnOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  const getActiveIcon = React.useCallback(() => {
    if (!editor) return <i class="bi bi-card-heading" />;

    const activeLevel = levels.find((level) => editor.isActive('heading', { level })) as
      | Level
      | undefined;

    if (!activeLevel) return <i class="bi bi-card-heading" />;

    const ActiveIcon = headingIcons[activeLevel];
    return <ActiveIcon />;
  }, [editor, levels]);

  const canToggleAnyHeading = React.useCallback((): boolean => {
    if (!editor) return false;
    return levels.some((level) => editor.can().toggleNode('heading', 'paragraph', { level }));
  }, [editor, levels]);

  const isDisabled = !canToggleAnyHeading();
  const isAnyHeadingActive = editor?.isActive('heading') ?? false;

  const show = React.useMemo(() => {
    if (!headingInSchema || !editor) {
      return false;
    }

    if (hideWhenUnavailable) {
      if (isNodeSelection(editor.state.selection) || !canToggleAnyHeading()) {
        return false;
      }
    }

    return true;
  }, [headingInSchema, editor, hideWhenUnavailable, canToggleAnyHeading]);

  if (!show || !editor || !editor.isEditable) {
    return null;
  }

  return (
    <Dropdown show={isOpen} onToggle={handleOnOpenChange}>
      <Dropdown.Toggle
        as={Button}
        disabled={isDisabled}
        className={clsx(
          isAnyHeadingActive && 'btn-outline-primary',
          isDisabled && 'btn-outline-secondary',
          'btn-sm',
        )}
        role="button"
        tabIndex={-1}
        aria-label="Format text as heading"
        tooltip="Heading"
        aria-pressed={isAnyHeadingActive}
        {...props}
      >
        {getActiveIcon()}
        <i class="bi bi-chevron-down" />
      </Dropdown.Toggle>

      <Dropdown.Menu>
        {levels.map((level) => (
          <Dropdown.Item key={`heading-${level}`}>
            <HeadingButton
              editor={editor}
              level={level}
              text={getFormattedHeadingName(level)}
              tooltip=""
            />
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default HeadingDropdownMenu;
