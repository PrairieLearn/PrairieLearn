import ace from 'ace-builds';
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { b64EncodeUnicode } from '../../../../lib/base64-util.js';

export interface QuestionCodeEditorsHandle {
  /** Resets the editor contents to match the current saved state (htmlContents/pythonContents props). */
  discardChanges: () => void;
}

export function QuestionCodeEditors({
  htmlContents,
  pythonContents,
  csrfToken,
  isGenerating,
  onHasChangesChange,
  filesError,
  onRetryFiles,
  editorRef,
}: {
  htmlContents: string | null;
  pythonContents: string | null;
  csrfToken: string;
  isGenerating: boolean;
  onHasChangesChange?: (hasChanges: boolean) => void;
  filesError?: Error | null;
  onRetryFiles?: () => void;
  editorRef?: Ref<QuestionCodeEditorsHandle>;
}) {
  const htmlEditorContainerRef = useRef<HTMLDivElement>(null);
  const pythonEditorContainerRef = useRef<HTMLDivElement>(null);
  const htmlEditorInstanceRef = useRef<ace.Ace.Editor | null>(null);
  const pythonEditorInstanceRef = useRef<ace.Ace.Editor | null>(null);

  // Track what we last synced to detect when props change externally.
  const syncedHtmlRef = useRef(htmlContents ?? '');
  const syncedPythonRef = useRef(pythonContents ?? '');

  const [htmlValue, setHtmlValue] = useState(htmlContents ?? '');
  const [pythonValue, setPythonValue] = useState(pythonContents ?? '');

  // Derive hasChanges by comparing current editor state to props.
  const hasChanges = htmlValue !== (htmlContents ?? '') || pythonValue !== (pythonContents ?? '');

  // Notify parent when hasChanges changes.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    onHasChangesChange?.(hasChanges);
  }, [hasChanges, onHasChangesChange]);

  // Initialize ACE editors once on mount.
  useEffect(() => {
    if (!htmlEditorContainerRef.current || !pythonEditorContainerRef.current) return;

    const aceBasePath = document.querySelector<HTMLMetaElement>(
      'meta[name="ace-base-path"]',
    )?.content;
    if (aceBasePath) {
      ace.config.set('basePath', aceBasePath);
    }

    const htmlEditor = ace.edit(htmlEditorContainerRef.current, {
      mode: 'ace/mode/html',
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    });
    htmlEditor.getSession().setValue(syncedHtmlRef.current);
    htmlEditor.getSession().setTabSize(2);
    htmlEditor.gotoLine(1, 0, false);
    htmlEditorInstanceRef.current = htmlEditor;

    const pythonEditor = ace.edit(pythonEditorContainerRef.current, {
      mode: 'ace/mode/python',
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    });
    pythonEditor.getSession().setValue(syncedPythonRef.current);
    pythonEditor.gotoLine(1, 0, false);
    pythonEditorInstanceRef.current = pythonEditor;

    // Update state when editor content changes (user edits or programmatic setValue).
    htmlEditor.getSession().on('change', () => setHtmlValue(htmlEditor.getValue()));
    pythonEditor.getSession().on('change', () => setPythonValue(pythonEditor.getValue()));

    return () => {
      htmlEditor.destroy();
      pythonEditor.destroy();
    };
  }, []);

  // Sync editor content when props change (e.g., after AI updates or saves).
  useEffect(() => {
    const htmlEditor = htmlEditorInstanceRef.current;
    const pythonEditor = pythonEditorInstanceRef.current;
    if (!htmlEditor || !pythonEditor) return;

    const newHtml = htmlContents ?? '';
    const newPython = pythonContents ?? '';

    if (newHtml !== syncedHtmlRef.current || newPython !== syncedPythonRef.current) {
      syncedHtmlRef.current = newHtml;
      syncedPythonRef.current = newPython;

      htmlEditor.getSession().setValue(newHtml);
      pythonEditor.getSession().setValue(newPython);

      // Clear undo history so users can't undo past this point.
      htmlEditor.getSession().getUndoManager().reset();
      pythonEditor.getSession().getUndoManager().reset();

      htmlEditor.gotoLine(1, 0, false);
      pythonEditor.gotoLine(1, 0, false);
    }
  }, [htmlContents, pythonContents]);

  useImperativeHandle(editorRef, () => ({
    discardChanges: () => {
      const htmlEditor = htmlEditorInstanceRef.current;
      const pythonEditor = pythonEditorInstanceRef.current;
      if (!htmlEditor || !pythonEditor) return;

      htmlEditor.getSession().setValue(syncedHtmlRef.current);
      pythonEditor.getSession().setValue(syncedPythonRef.current);

      htmlEditor.getSession().getUndoManager().reset();
      pythonEditor.getSession().getUndoManager().reset();

      htmlEditor.gotoLine(1, 0, false);
      pythonEditor.gotoLine(1, 0, false);
    },
  }));

  // Forbid manual edits while the agent is working.
  useEffect(() => {
    htmlEditorInstanceRef.current?.setReadOnly(isGenerating);
    pythonEditorInstanceRef.current?.setReadOnly(isGenerating);
  }, [isGenerating]);

  return (
    <div className="editor-panes p-2 gap-2">
      <div className="editor-pane-status">
        {filesError ? (
          <div
            className="alert alert-danger mb-0 py-2 d-flex align-items-center justify-content-between"
            role="alert"
          >
            <span>
              <strong>Error loading files:</strong> {filesError.message}
            </span>
            {onRetryFiles && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={onRetryFiles}
              >
                <i className="fa fa-refresh me-1" aria-hidden="true" />
                Retry
              </button>
            )}
          </div>
        ) : isGenerating ? (
          <div className="alert alert-info mb-0 py-2 d-flex align-items-center" role="alert">
            <div className="spinner-border spinner-border-sm me-2" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            Editors are read-only while generation is in progress
          </div>
        ) : (
          <div className="d-flex flex-row align-items-center justify-content-between ps-2">
            <span>{hasChanges ? 'Unsaved changes.' : 'No unsaved changes.'}</span>
            <form method="post">
              <input type="hidden" name="__action" value="submit_manual_revision" />
              <input type="hidden" name="__csrf_token" value={csrfToken} />
              <button type="submit" className="btn btn-sm btn-primary" disabled={!hasChanges}>
                Save edits
              </button>
              <input type="hidden" name="html" value={b64EncodeUnicode(htmlValue)} />
              <input type="hidden" name="python" value={b64EncodeUnicode(pythonValue)} />
            </form>
          </div>
        )}
      </div>
      <div
        className="editor-pane-html d-flex flex-column border rounded"
        style={{ overflow: 'hidden' }}
      >
        <div className="py-2 px-3 font-monospace bg-light">question.html</div>
        <div ref={htmlEditorContainerRef} className="flex-grow-1" />
      </div>
      <div
        className="editor-pane-python d-flex flex-column border rounded"
        style={{ overflow: 'hidden' }}
      >
        <div className="py-2 px-3 font-monospace bg-light">server.py</div>
        <div ref={pythonEditorContainerRef} className="flex-grow-1" />
      </div>
    </div>
  );
}
