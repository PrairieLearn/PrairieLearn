import ace from 'ace-builds';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface AceFileEditorHandle {
  readonly editor: ace.Ace.Editor | null;
  focus: () => void;
  resize: () => void;
  setReadOnly: (readOnly: boolean) => void;
}

export const AceFileEditor = forwardRef<
  AceFileEditorHandle,
  {
    value: string;
    mode?: string;
    readOnly?: boolean;
    className?: string;
    focusOnMount?: boolean;
    options?: Partial<ace.Ace.EditorOptions>;
    onChange?: (value: string) => void;
    onReady?: (editor: ace.Ace.Editor) => void;
  }
>(function AceFileEditor(
  {
    value,
    mode = 'ace/mode/text',
    readOnly = false,
    className,
    focusOnMount = false,
    options,
    onChange,
    onReady,
  },
  ref,
) {
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
    setReadOnly: (nextReadOnly) => editorRef.current?.setReadOnly(nextReadOnly),
  }));

  // Ace owns the editor DOM, so this effect creates and tears down the editor instance.
  useEffect(() => {
    if (!containerRef.current) return;

    const aceBasePath = document.querySelector<HTMLMetaElement>(
      'meta[name="ace-base-path"]',
    )?.content;
    if (aceBasePath) {
      ace.config.set('basePath', aceBasePath);
    }

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

  // Reset Ace contents when the backing file changes.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === valueRef.current) return;

    valueRef.current = value;
    editor.getSession().setValue(value);
    editor.gotoLine(1, 0, false);
    editor.getSession().getUndoManager().reset();
  }, [value]);

  return <div ref={containerRef} className={className} />;
});

AceFileEditor.displayName = 'AceFileEditor';
