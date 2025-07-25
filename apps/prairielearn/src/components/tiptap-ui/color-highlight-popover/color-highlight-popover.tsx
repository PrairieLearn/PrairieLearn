import type { Node } from '@tiptap/pm/model';
import { type Editor, isNodeSelection } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';
import { ButtonGroup, Overlay } from 'react-bootstrap';
import type { OverlayInjectedProps } from 'react-bootstrap/esm/Overlay.js';

import { useMenuNavigation } from '../../../lib/hooks/use-menu-navigation.js';
import { useTiptapEditor } from '../../../lib/hooks/use-tiptap-editor.js';
import { findNodePosition, isEmptyNode, isMarkInSchema } from '../../../lib/tiptap-utils.js';
import { Button, type ButtonProps } from '../../bootstrap-ui-primitive/button/index.js';

export interface ColorHighlightPopoverColor {
  label: string;
  value: string;
  border?: string;
}

export interface ColorHighlightOverlayProps extends OverlayInjectedProps {
  colors?: ColorHighlightPopoverColor[];
}

export interface ColorHighlightPopoverProps extends Omit<ButtonProps, 'type'> {
  /** The TipTap editor instance. */
  editor?: Editor | null;
  /** The highlight colors to display in the popover. */
  colors?: ColorHighlightPopoverColor[];
  /** Whether to hide the highlight popover when unavailable. */
  hideWhenUnavailable?: boolean;
}

export interface ColorHighlightButtonProps extends Omit<ButtonProps, 'type'> {
  /**
   * The node to apply highlight to
   */
  node?: Node | null;
  /**
   * The position of the node in the document
   */
  nodePos?: number | null;
  /**
   * The color to apply when toggling the highlight.
   * If not provided, it will use the default color from the extension.
   */
  color: string;
  /**
   * Optional text to display alongside the icon.
   */
  text?: string;
  /**
   * Whether the button should hide when the mark is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean;
  /**
   * Called when the highlight is applied.
   */
  onApplied?: (color: string) => void;
}

/**
 * Checks if highlight can be toggled in the current editor state
 */
export function canToggleHighlight(editor: Editor | null): boolean {
  if (!editor) return false;
  try {
    return editor.can().setMark('highlight');
  } catch {
    return false;
  }
}

/**
 * Checks if highlight is active in the current selection
 */
export function isHighlightActive(editor: Editor | null, color: string): boolean {
  if (!editor) return false;
  return editor.isActive('highlight', { color });
}

/**
 * Toggles highlight on the current selection or specified node
 */
export function toggleHighlight(
  editor: Editor | null,
  color: string,
  node?: Node | null,
  nodePos?: number | null,
): void {
  if (!editor) return;

  try {
    const chain = editor.chain().focus();

    if (isEmptyNode(node)) {
      chain.toggleMark('highlight', { color }).run();
    } else if (nodePos !== undefined && nodePos !== null && nodePos !== -1) {
      chain.setNodeSelection(nodePos).toggleMark('highlight', { color }).run();
    } else if (node) {
      const foundPos = findNodePosition({ editor, node });
      if (foundPos) {
        chain.setNodeSelection(foundPos.pos).toggleMark('highlight', { color }).run();
      } else {
        chain.toggleMark('highlight', { color }).run();
      }
    } else {
      chain.toggleMark('highlight', { color }).run();
    }

    editor.chain().setMeta('hideDragHandle', true).run();
  } catch (error) {
    console.error('Failed to apply highlight:', error);
  }
}

/**
 * Determines if the highlight button should be disabled
 */
export function isColorHighlightButtonDisabled(
  editor: Editor | null,
  userDisabled = false,
): boolean {
  if (!editor || userDisabled) return true;

  const isIncompatibleContext =
    editor.isActive('code') || editor.isActive('codeBlock') || editor.isActive('imageUpload');

  return isIncompatibleContext || !canToggleHighlight(editor);
}

/**
 * Determines if the highlight button should be shown
 */
export function shouldShowColorHighlightButton(
  editor: Editor | null,
  hideWhenUnavailable: boolean,
  highlightInSchema: boolean,
): boolean {
  if (!highlightInSchema || !editor) return false;

  if (hideWhenUnavailable) {
    if (isNodeSelection(editor.state.selection) || !canToggleHighlight(editor)) {
      return false;
    }
  }

  return true;
}

/**
 * Custom hook to manage highlight button state
 */
export function useHighlightState(
  editor: Editor | null,
  color: string,
  disabled = false,
  hideWhenUnavailable = false,
) {
  const highlightInSchema = isMarkInSchema('highlight', editor);
  const isDisabled = isColorHighlightButtonDisabled(editor, disabled);
  const isActive = isHighlightActive(editor, color);

  const shouldShow = React.useMemo(
    () => shouldShowColorHighlightButton(editor, hideWhenUnavailable, highlightInSchema),
    [editor, hideWhenUnavailable, highlightInSchema],
  );

  return {
    highlightInSchema,
    isDisabled,
    isActive,
    shouldShow,
  };
}

/**
 * ColorHighlightButton component for TipTap editor
 */
export const ColorHighlightButton = React.forwardRef<HTMLButtonElement, ColorHighlightButtonProps>(
  (
    {
      node,
      nodePos,
      color,
      hideWhenUnavailable = false,
      className = '',
      disabled,
      onClick,
      onApplied,
    },
    ref,
  ) => {
    const editor = useTiptapEditor();
    const { isDisabled, isActive, shouldShow } = useHighlightState(
      editor,
      color,
      disabled as boolean | undefined,
      hideWhenUnavailable,
    );

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);

        if (!e.defaultPrevented && !isDisabled && editor) {
          toggleHighlight(editor, color, node, nodePos);
          onApplied?.(color);
        }
      },
      [color, editor, isDisabled, node, nodePos, onClick, onApplied],
    );

    if (!shouldShow || !editor || !editor.isEditable) {
      return null;
    }

    return (
      <Button
        ref={ref}
        type="button"
        className={className}
        disabled={isDisabled}
        style={{ backgroundColor: isActive ? color : 'transparent' }}
        variant="outline-secondary"
        role="button"
        tabIndex={-1}
        aria-label={`${color} highlight color`}
        aria-pressed={isActive}
        onClick={handleClick}
      >
        <i className="bi bi-marker-tip" style={{ color: isActive ? 'white' : color }} />
      </Button>
    );
  },
);

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

export function ColorHighlightOverlay({
  colors = DEFAULT_HIGHLIGHT_COLORS,
  placement: _placement,
  arrowProps: _arrowProps,
  show: _show,
  popper,
  hasDoneInitialMeasure: _hasDoneInitialMeasure,
  style,
}: ColorHighlightOverlayProps) {
  const editor = useTiptapEditor();
  const containerRef = useRef<HTMLDivElement>(null);

  const removeHighlight = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetMark('highlight').run();
  }, [editor]);

  const menuItems = useMemo(
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
    },
    autoSelectFirstItem: false,
  });
  console.log(selectedIndex);

  return (
    <ButtonGroup style={style} className="bg-white" vertical>
      {colors.map((color, index) => (
        <ColorHighlightButton
          key={color.value}
          color={color.value}
          aria-label={`${color.label} highlight color`}
          tabIndex={index === selectedIndex ? 0 : -1}
          onClick={() => popper.scheduleUpdate?.()}
        />
      ))}
      <Button
        aria-label="Remove highlight"
        tabIndex={selectedIndex === colors.length ? 0 : -1}
        type="button"
        role="menuitem"
        variant={selectedIndex === colors.length ? 'outline-primary' : 'outline-secondary'}
        onClick={removeHighlight}
      >
        <i className="bi bi-ban" />
      </Button>
    </ButtonGroup>
  );
}

export function ColorHighlightPopover({
  colors = DEFAULT_HIGHLIGHT_COLORS,
  hideWhenUnavailable = false,
}: ColorHighlightPopoverProps) {
  const editor = useTiptapEditor();
  const [show, setShow] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [_isDisabled, setIsDisabled] = useState(false);

  const markAvailable = isMarkInSchema('highlight', editor);

  useEffect(() => {
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

  const _isActive = editor?.isActive('highlight') ?? false;

  const shouldShow = useMemo(() => {
    if (!hideWhenUnavailable || !editor) return true;

    return !(isNodeSelection(editor.state.selection) || !canToggleHighlight(editor));
  }, [hideWhenUnavailable, editor]);

  if (!shouldShow || !editor || !editor.isEditable) {
    return null;
  }

  return (
    <>
      <Button
        ref={buttonRef}
        variant="outline-secondary"
        aria-label="Highlight text"
        onClick={() => setShow(!show)}
      >
        <i className="bi bi-highlighter" />
      </Button>
      <Overlay placement="bottom" target={buttonRef} show={show}>
        {(props) => <ColorHighlightOverlay colors={colors} {...props} />}
      </Overlay>
    </>
  );
}

export default ColorHighlightPopover;
