import type { Node } from '@tiptap/pm/model';
import { type Editor, isNodeSelection } from '@tiptap/react';
import * as React from 'react';

import { Button, type ButtonProps } from '#components/bootstrap-ui-primitive/button/index.js';
import { useTiptapEditor } from '#lib/hooks/use-tiptap-editor.js';
import { findNodePosition, isEmptyNode, isMarkInSchema } from '#lib/tiptap-utils.js';

export const HIGHLIGHT_COLORS = [
  {
    label: 'Default background',
    value: 'var(--bs-white)',
    border: 'var(--bs-gray-600)',
  },
  {
    label: 'Gray background',
    value: 'var(--bs-gray-500)',
    border: 'var(--bs-gray-600)',
  },
  {
    label: 'Brown background',
    value: 'var(--bs-brown-500)',
    border: 'var(--bs-brown-600)',
  },
  {
    label: 'Orange background',
    value: 'var(--bs-orange-500)',
    border: 'var(--bs-orange-600)',
  },
  {
    label: 'Yellow background',
    value: 'var(--bs-yellow-500)',
    border: 'var(--bs-yellow-600)',
  },
  {
    label: 'Green background',
    value: 'var(--bs-green-500)',
    border: 'var(--bs-green-600)',
  },
  {
    label: 'Blue background',
    value: 'var(--bs-blue-500)',
    border: 'var(--bs-blue-600)',
  },
  {
    label: 'Purple background',
    value: 'var(--bs-purple-500)',
    border: 'var(--bs-purple-600)',
  },
  {
    label: 'Pink background',
    value: 'var(--bs-pink-500)',
    border: 'var(--bs-pink-600)',
  },
  {
    label: 'Red background',
    value: 'var(--bs-red-500)',
    border: 'var(--bs-red-600)',
  },
];

export interface ColorHighlightButtonProps extends Omit<ButtonProps, 'type'> {
  /**
   * The TipTap editor instance.
   */
  editor?: Editor | null;
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

const DEFAULT_STYLE = {};
/**
 * ColorHighlightButton component for TipTap editor
 */
export const ColorHighlightButton = React.forwardRef<HTMLButtonElement, ColorHighlightButtonProps>(
  (
    {
      editor: providedEditor,
      node,
      nodePos,
      color,
      text,
      hideWhenUnavailable = false,
      className = '',
      disabled,
      onClick,
      onApplied,
      children,
      style = DEFAULT_STYLE,
      ...buttonProps
    },
    ref,
  ) => {
    const editor = useTiptapEditor(providedEditor);
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

    const buttonStyle = React.useMemo(
      () =>
        ({
          ...style,
          '--highlight-color': color,
        }) as React.CSSProperties,
      [color, style],
    );

    if (!shouldShow || !editor || !editor.isEditable) {
      return null;
    }

    return (
      <Button
        type="button"
        className={className}
        disabled={isDisabled}
        variant="outline-secondary"
        role="button"
        tabIndex={-1}
        aria-label={`${color} highlight color`}
        aria-pressed={isActive}
        style={buttonStyle}
        onClick={handleClick}
        {...buttonProps}
        ref={ref}
      >
        {children || (
          <>
            <span
              className="tiptap-button-highlight"
              style={
                { backgroundColor: color, border: `1px solid ${color}` } as React.CSSProperties
              }
            />
            {text && <span className="tiptap-button-text">{text}</span>}
          </>
        )}
      </Button>
    );
  },
);

ColorHighlightButton.displayName = 'ColorHighlightButton';

export default ColorHighlightButton;
