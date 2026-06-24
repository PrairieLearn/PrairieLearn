import { type Ref, useEffect, useImperativeHandle, useState } from 'react';

import { AceFileEditor } from '../../../../components/AceFileEditor.js';
import { b64EncodeUnicode } from '../../../../lib/base64-util.js';

export interface QuestionCodeEditorsHandle {
  /** Resets the editor contents to match the current saved state (htmlContents/pythonContents props). */
  discardChanges: () => void;
}

interface QuestionCodeEditorsProps {
  htmlContents: string | null;
  pythonContents: string | null;
  csrfToken: string;
  isGenerating: boolean;
  onHasChangesChange?: (hasChanges: boolean) => void;
  filesError?: Error | null;
  onRetryFiles?: () => void;
  editorRef?: Ref<QuestionCodeEditorsHandle>;
}

function QuestionCodeEditorsInner({
  savedHtml,
  savedPython,
  csrfToken,
  isGenerating,
  onHasChangesChange,
  filesError,
  onRetryFiles,
  editorRef,
}: Omit<QuestionCodeEditorsProps, 'htmlContents' | 'pythonContents'> & {
  savedHtml: string;
  savedPython: string;
}) {
  const [htmlValue, setHtmlValue] = useState(savedHtml);
  const [pythonValue, setPythonValue] = useState(savedPython);

  const hasChanges = htmlValue !== savedHtml || pythonValue !== savedPython;

  // Notify parent when hasChanges changes.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    onHasChangesChange?.(hasChanges);
  }, [hasChanges, onHasChangesChange]);

  useImperativeHandle(editorRef, () => ({
    discardChanges: () => {
      setHtmlValue(savedHtml);
      setPythonValue(savedPython);
    },
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
          mode="ace/mode/html"
          readOnly={isGenerating}
          className="flex-grow-1"
          onChange={setHtmlValue}
          onReady={(editor) => editor.getSession().setTabSize(2)}
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
        />
      </div>
    </div>
  );
}

export function QuestionCodeEditors(props: QuestionCodeEditorsProps) {
  const { htmlContents, pythonContents, ...editorProps } = props;
  const savedHtml = htmlContents ?? '';
  const savedPython = pythonContents ?? '';

  return (
    <QuestionCodeEditorsInner
      key={`${savedHtml}\0${savedPython}`}
      {...editorProps}
      savedHtml={savedHtml}
      savedPython={savedPython}
    />
  );
}
