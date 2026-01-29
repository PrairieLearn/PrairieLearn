import ace from 'ace-builds';
import { useEffect, useRef, useState } from 'react';

import { b64EncodeUnicode } from '../../../../lib/base64-util.js';

export function QuestionCodeEditors({
  htmlContents,
  pythonContents,
  csrfToken,
  isGenerating,
  onHasChangesChange,
  filesError,
  onRetryFiles,
}: {
  htmlContents: string | null;
  pythonContents: string | null;
  csrfToken: string;
  isGenerating: boolean;
  onHasChangesChange?: (hasChanges: boolean) => void;
  filesError?: Error | null;
  onRetryFiles?: () => void;
}) {
  const htmlEditorRef = useRef<HTMLDivElement>(null);
  const pythonEditorRef = useRef<HTMLDivElement>(null);
  const htmlEditorInstanceRef = useRef<ace.Ace.Editor | null>(null);
  const pythonEditorInstanceRef = useRef<ace.Ace.Editor | null>(null);

  const [htmlValue, setHtmlValue] = useState(htmlContents ?? '');
  const [pythonValue, setPythonValue] = useState(pythonContents ?? '');
  const [hasChanges, setHasChanges] = useState(false);

  // Notify parent of changes. This needs to use an effect because the state
  // is managed locally and we need to inform the parent when it changes.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    onHasChangesChange?.(hasChanges);
  }, [hasChanges, onHasChangesChange]);

  // Initialize ACE editors.
  // TODO: this doesn't have any sensible undo story. Should it?
  useEffect(() => {
    if (!htmlEditorRef.current || !pythonEditorRef.current) return;

    // Configure ACE base path from meta tag
    const aceBasePath = document.querySelector<HTMLMetaElement>(
      'meta[name="ace-base-path"]',
    )?.content;
    if (aceBasePath) {
      ace.config.set('basePath', aceBasePath);
    }

    // Initialize HTML editor
    const htmlEditor = ace.edit(htmlEditorRef.current, {
      mode: 'ace/mode/html',
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    });
    htmlEditor.getSession().setValue(htmlContents ?? '');
    htmlEditor.getSession().setTabSize(2);
    htmlEditor.gotoLine(1, 0, false);
    htmlEditorInstanceRef.current = htmlEditor;

    // Initialize Python editor
    const pythonEditor = ace.edit(pythonEditorRef.current, {
      mode: 'ace/mode/python',
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    });
    pythonEditor.getSession().setValue(pythonContents ?? '');
    pythonEditor.gotoLine(1, 0, false);
    pythonEditorInstanceRef.current = pythonEditor;

    // Track changes
    const handleHtmlChange = () => {
      const newValue = htmlEditor.getValue();
      setHtmlValue(newValue);
      setHasChanges(
        newValue !== (htmlContents ?? '') || pythonEditor.getValue() !== (pythonContents ?? ''),
      );
    };

    const handlePythonChange = () => {
      const newValue = pythonEditor.getValue();
      setPythonValue(newValue);
      setHasChanges(
        htmlEditor.getValue() !== (htmlContents ?? '') || newValue !== (pythonContents ?? ''),
      );
    };

    htmlEditor.getSession().on('change', handleHtmlChange);
    pythonEditor.getSession().on('change', handlePythonChange);

    // Reset state to match new content. This is necessary because setValue()
    // is called before the change handlers are attached, so the handlers don't
    // run and the state remains stale from previous content.
    //
    // TODO: can we do this in a wey that keeps the linter happy?
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
    setHtmlValue(htmlContents ?? '');
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
    setPythonValue(pythonContents ?? '');
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect, react-you-might-not-need-an-effect/no-adjust-state-on-prop-change
    setHasChanges(false);

    return () => {
      htmlEditor.destroy();
      pythonEditor.destroy();
    };
  }, [htmlContents, pythonContents]);

  // Set read-only mode when generating.
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
        <div ref={htmlEditorRef} className="flex-grow-1" />
      </div>
      <div
        className="editor-pane-python d-flex flex-column border rounded"
        style={{ overflow: 'hidden' }}
      >
        <div className="py-2 px-3 font-monospace bg-light">server.py</div>
        <div ref={pythonEditorRef} className="flex-grow-1" />
      </div>
    </div>
  );
}
