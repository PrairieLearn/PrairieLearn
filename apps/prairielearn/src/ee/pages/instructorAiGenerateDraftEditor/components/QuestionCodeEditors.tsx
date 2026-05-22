import { type Ref, useImperativeHandle, useState } from 'react';

import { AceFileEditor } from '../../../../components/AceFileEditor.js';
import { b64EncodeUnicode } from '../../../../lib/base64-util.js';

export interface QuestionCodeEditorsHandle {
  /** Resets the editor contents to match the current saved state (htmlContents/pythonContents props). */
  discardChanges: () => void;
  /** Returns whether the editors currently hold unsaved changes. */
  getHasChanges: () => boolean;
}

export function QuestionCodeEditors({
  htmlContents,
  pythonContents,
  csrfToken,
  isGenerating,
  filesError,
  onRetryFiles,
  editorRef,
}: {
  htmlContents: string | null;
  pythonContents: string | null;
  csrfToken: string;
  isGenerating: boolean;
  filesError?: { message: string } | null;
  onRetryFiles?: () => void;
  editorRef?: Ref<QuestionCodeEditorsHandle>;
}) {
  const savedHtml = htmlContents ?? '';
  const savedPython = pythonContents ?? '';

  const [htmlValue, setHtmlValue] = useState(savedHtml);
  const [pythonValue, setPythonValue] = useState(savedPython);

  // Reset the editors to match the saved files when they change externally (e.g.
  // after AI updates or saves), discarding any local edits. This adjusts state
  // during render rather than in an effect; see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [syncedHtml, setSyncedHtml] = useState(savedHtml);
  if (syncedHtml !== savedHtml) {
    setSyncedHtml(savedHtml);
    setHtmlValue(savedHtml);
  }
  const [syncedPython, setSyncedPython] = useState(savedPython);
  if (syncedPython !== savedPython) {
    setSyncedPython(savedPython);
    setPythonValue(savedPython);
  }

  // Derive hasChanges by comparing current editor state to the saved files.
  const hasChanges = htmlValue !== savedHtml || pythonValue !== savedPython;

  useImperativeHandle(editorRef, () => ({
    discardChanges: () => {
      setHtmlValue(savedHtml);
      setPythonValue(savedPython);
    },
    getHasChanges: () => hasChanges,
  }));

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
        <AceFileEditor
          value={htmlValue}
          mode="ace/mode/handlebars"
          readOnly={isGenerating}
          className="flex-grow-1"
          onChange={setHtmlValue}
          onReady={(editor) => {
            editor.getSession().setTabSize(2);
            // question.html in a draft is a v3 question file; lint its Mustache syntax.
            document.dispatchEvent(
              new CustomEvent('pl:html-mustache-linter-attach', { detail: { editor } }),
            );
          }}
        />
      </div>
      <div
        className="editor-pane-python d-flex flex-column border rounded"
        style={{ overflow: 'hidden' }}
      >
        <div className="py-2 px-3 font-monospace bg-light">server.py</div>
        <AceFileEditor
          value={pythonValue}
          mode="ace/mode/python"
          readOnly={isGenerating}
          className="flex-grow-1"
          onChange={setPythonValue}
          onReady={(editor) => editor.getSession().setTabSize(2)}
        />
      </div>
    </div>
  );
}
