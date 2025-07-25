/* eslint-disable jsx-a11y-x/no-noninteractive-tabindex */
import { type Editor, isNodeSelection } from '@tiptap/react';
import * as React from 'react';

import {
  ColorHighlightButton,
  canToggleHighlight,
} from '#components/tiptap-ui/color-highlight-button/index.js';
import { Button, type ButtonProps } from '#components/bootstrap-ui-primitive/button/index.js';
import { Separator } from '#components/bootstrap-ui-primitive/separator/index.js';
import { useMenuNavigation } from '#lib/hooks/use-menu-navigation.js';
import { useTiptapEditor } from '#lib/hooks/use-tiptap-editor.js';
import { isMarkInSchema } from '#lib/tiptap-utils.js';
import { OverlayTrigger } from 'react-bootstrap';

export interface ColorHighlightPopoverColor {
  label: string;
  value: string;
  border?: string;
}

export interface ColorHighlightPopoverContentProps {
  editor?: Editor | null;
  colors?: ColorHighlightPopoverColor[];
  onClose?: () => void;
}

export interface ColorHighlightPopoverProps extends Omit<ButtonProps, 'type'> {
  /** The TipTap editor instance. */
  editor?: Editor | null;
  /** The highlight colors to display in the popover. */
  colors?: ColorHighlightPopoverColor[];
  /** Whether to hide the highlight popover when unavailable. */
  hideWhenUnavailable?: boolean;
}

export const DEFAULT_HIGHLIGHT_COLORS: ColorHighlightPopoverColor[] = [
  {
    label: 'Green',
    value: 'var(--bs-green)',
    border: 'var(--bs-green-dark)',
  },
  {
    label: 'Blue',
    value: 'var(--bs-blue)',
    border: 'var(--bs-blue-dark)',
  },
  {
    label: 'Red',
    value: 'var(--bs-red)',
    border: 'var(--bs-red-dark)',
  },
  {
    label: 'Purple',
    value: 'var(--bs-purple)',
    border: 'var(--bs-purple-dark)',
  },
  {
    label: 'Yellow',
    value: 'var(--bs-yellow)',
    border: 'var(--bs-yellow-dark)',
  },
];

export const ColorHighlightPopoverButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="outline-secondary"
      className={className}
      role="button"
      tabIndex={-1}
      aria-label="Highlight text"
      tooltip="Highlight"
      {...props}
    >
      {children || <i class="bi bi-highlighter" />}
    </Button>
  ),
);

ColorHighlightPopoverButton.displayName = 'ColorHighlightPopoverButton';

export function ColorHighlightPopoverContent({
  editor: providedEditor,
  colors = DEFAULT_HIGHLIGHT_COLORS,
  onClose,
}: ColorHighlightPopoverContentProps) {
  const editor = useTiptapEditor(providedEditor);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const removeHighlight = React.useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetMark('highlight').run();
    onClose?.();
  }, [editor, onClose]);

  const menuItems = React.useMemo(
    () => [...colors, { label: 'Remove highlight', value: 'none' }],
    [colors],
  );

  const { selectedIndex } = useMenuNavigation({
    containerRef,
    items: menuItems,
    orientation: 'both',
    onSelect: (item) => {
      if (item.value === 'none') {
        removeHighlight();
      }
      onClose?.();
    },
    onClose,
    autoSelectFirstItem: false,
  });

  return (
    <div ref={containerRef} className="d-flex gap-1 align-items-center" tabIndex={0}>
      <div className="d-flex gap-1">
        {colors.map((color, index) => (
          <ColorHighlightButton
            key={color.value}
            editor={editor}
            color={color.value}
            style={{
              color: color.value,
              border: `1px ${index === selectedIndex ? 'solid' : 'dashed'} ${color.border}`,
            }}
            aria-label={`${color.label} highlight color`}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={onClose}
          />
        ))}
      </div>

      <Separator />

      <div className="d-flex gap-1">
        <Button
          aria-label="Remove highlight"
          tabIndex={selectedIndex === colors.length ? 0 : -1}
          type="button"
          role="menuitem"
          variant={selectedIndex === colors.length ? 'outline-primary' : 'outline-secondary'}
          onClick={removeHighlight}
        >
          <i class="bi bi-ban" />
        </Button>
      </div>
    </div>
  );
}

export function ColorHighlightPopover({
  editor: providedEditor,
  colors = DEFAULT_HIGHLIGHT_COLORS,
  hideWhenUnavailable = false,
  ...props
}: ColorHighlightPopoverProps) {
  const editor = useTiptapEditor(providedEditor);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isDisabled, setIsDisabled] = React.useState(false);

  const markAvailable = isMarkInSchema('highlight', editor);

  React.useEffect(() => {
    if (!editor) return;

    const updateIsDisabled = () => {
      let isDisabled = false;

      if (!markAvailable || !editor) {
        isDisabled = true;
      }

      const isInCompatibleContext =
        editor.isActive('code') || editor.isActive('codeBlock') || editor.isActive('imageUpload');

      if (isInCompatibleContext) {
        isDisabled = true;
      }

      setIsDisabled(isDisabled);
    };

    editor.on('selectionUpdate', updateIsDisabled);
    editor.on('update', updateIsDisabled);

    return () => {
      editor.off('selectionUpdate', updateIsDisabled);
      editor.off('update', updateIsDisabled);
    };
  }, [editor, markAvailable]);

  const isActive = editor?.isActive('highlight') ?? false;

  const shouldShow = React.useMemo(() => {
    if (!hideWhenUnavailable || !editor) return true;

    return !(isNodeSelection(editor.state.selection) || !canToggleHighlight(editor));
  }, [hideWhenUnavailable, editor]);

  if (!shouldShow || !editor || !editor.isEditable) {
    return null;
  }

  return (
    <OverlayTrigger
      show={isOpen}
      onToggle={(nextShow) => setIsOpen(nextShow)}
      overlay={
        <ColorHighlightPopoverContent
          editor={editor}
          colors={colors}
          onClose={() => setIsOpen(false)}
        />
      }
    >
      <ColorHighlightPopoverButton disabled={isDisabled} aria-pressed={isActive} {...props} />
    </OverlayTrigger>
  );
}

export default ColorHighlightPopover;
