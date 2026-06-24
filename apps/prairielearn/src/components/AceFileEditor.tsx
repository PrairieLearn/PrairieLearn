import ace from 'ace-builds';
import { type Ref, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Ace loads modes/themes/workers dynamically as needed, but it's unable to
 * identify the base path implicitly when using compiled assets. We explicitly
 * set the paths based on the `ace-base-path` meta tag, which is computed
 * server-side from the asset path for the `ace-builds` module.
 */
function configureAceBasePaths() {
  const aceBasePath = document.querySelector<HTMLMetaElement>(
    'meta[name="ace-base-path"]',
  )?.content;
  if (!aceBasePath) return;

  ace.config.set('basePath', aceBasePath);
  ace.config.set('modePath', aceBasePath);
  ace.config.set('workerPath', aceBasePath);
  ace.config.set('themePath', aceBasePath);
}

export interface AceFileEditorHandle {
  readonly editor: ace.Ace.Editor | null;
  focus: () => void;
  resize: () => void;
}

/**
 * Given an Ace cursor position (row and column) and the document's lines,
 * returns the cursor's offset from the start of the document.
 */
export function getCursorOffsetFromCursorPosition(
  position: ace.Ace.Point,
  lines: string[],
): number {
  const cursorOffset = lines.slice(0, position.row).reduce((acc, line) => acc + line.length + 1, 0);
  return cursorOffset + position.column;
}

/**
 * Given a cursor offset from the start of the document and the document's lines,
 * returns the equivalent Ace cursor position (row and column).
 */
export function getCursorPositionFromCursorOffset(
  cursorOffset: number,
  lines: string[],
): ace.Ace.Point {
  let row = 0;
  let column = 0;
  let offset = 0;
  for (const line of lines) {
    if (offset + line.length >= cursorOffset) {
      column = cursorOffset - offset;
      break;
    }
    offset += line.length + 1;
    row += 1;
  }
  return { row, column };
}

export function AceFileEditor({
  value,
  mode = 'ace/mode/text',
  readOnly = false,
  className,
  focusOnMount = false,
  options,
  onChange,
  onReady,
  ref,
}: {
  value: string;
  mode?: string;
  readOnly?: boolean;
  className?: string;
  focusOnMount?: boolean;
  options?: Partial<ace.Ace.EditorOptions>;
  onChange?: (value: string) => void;
  onReady?: (editor: ace.Ace.Editor) => void;
  ref?: Ref<AceFileEditorHandle>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ace.Ace.Editor | null>(null);
  const valueRef = useRef(value);
  const initialModeRef = useRef(mode);
  const initialOptionsRef = useRef(options);
  const initialReadOnlyRef = useRef(readOnly);
  const initialFocusOnMountRef = useRef(focusOnMount);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);

  onChangeRef.current = onChange;
  onReadyRef.current = onReady;

  useImperativeHandle(ref, () => ({
    get editor() {
      return editorRef.current;
    },
    focus: () => editorRef.current?.focus(),
    resize: () => editorRef.current?.resize(),
  }));

  // Ace owns the editor DOM, so this effect creates and tears down the editor instance.
  useEffect(() => {
    if (!containerRef.current) return;

    configureAceBasePaths();

    const editor = ace.edit(containerRef.current, {
      enableKeyboardAccessibility: true,
      mode: initialModeRef.current,
      readOnly: initialReadOnlyRef.current,
      showPrintMargin: false,
      theme: 'ace/theme/chrome',
      ...initialOptionsRef.current,
    } satisfies Partial<ace.Ace.EditorOptions>);

    editor.getSession().setValue(valueRef.current);
    editor.gotoLine(1, 0, false);
    editor.getSession().getUndoManager().reset();
    if (initialFocusOnMountRef.current) editor.focus();

    const handleChange = () => {
      const nextValue = editor.getValue();
      valueRef.current = nextValue;
      onChangeRef.current?.(nextValue);
    };

    editor.getSession().on('change', handleChange);
    editorRef.current = editor;
    onReadyRef.current?.(editor);

    return () => {
      editor.getSession().off('change', handleChange);
      editor.destroy();
      editor.container.replaceChildren();
      editorRef.current = null;
    };
  }, []);

  // Keep imperative Ace options in sync with React props without rebuilding the editor.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.getSession().setMode(mode);
    editor.setReadOnly(readOnly);
  }, [mode, readOnly]);

  // Reset Ace contents when the `value` prop changes out from under local edits
  // (e.g. discarding changes back to a saved baseline). This is destructive: it
  // replaces the document and clears the undo history and cursor position. During
  // normal editing it's a no-op, since `value` tracks `valueRef` via `onChange`.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === valueRef.current) return;

    valueRef.current = value;
    editor.getSession().setValue(value);
    editor.gotoLine(1, 0, false);
    editor.getSession().getUndoManager().reset();
  }, [value]);

  return <div ref={containerRef} className={className} />;
}
