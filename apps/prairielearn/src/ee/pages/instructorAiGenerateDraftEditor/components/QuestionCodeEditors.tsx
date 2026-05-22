import { useMutation } from '@tanstack/react-query';
import { type Ref, useImperativeHandle, useState } from 'react';

import { AceFileEditor } from '../../../../components/AceFileEditor.js';
import { b64EncodeUnicode } from '../../../../lib/base64-util.js';
import {
  getAppError,
  renderAppError,
  syncJobFailedRenderer,
} from '../../../../lib/client/errors.js';
import type { AiDraftFilesError } from '../../../../trpc/shared/ai-draft-files.js';

import { useTRPC } from './aiDraftFilesTrpc.js';
import { useDraftFiles } from './draftFilesContext.js';

export interface QuestionCodeEditorsHandle {
  /** Resets the editor contents to match the current saved state (htmlContents/pythonContents props). */
  discardChanges: () => void;
  /** Returns whether the editors currently hold unsaved changes. */
  getHasChanges: () => boolean;
}

export function QuestionCodeEditors({
  htmlContents,
  pythonContents,
  filesError,
  editorRef,
}: {
  htmlContents: string | null;
  pythonContents: string | null;
  filesError?: { message: string } | null;
  editorRef?: Ref<QuestionCodeEditorsHandle>;
}) {
  const trpc = useTRPC();
  const { questionId, urlPrefix, isGenerating, onFilesMutated, refetchFiles } = useDraftFiles();
  const saveMutation = useMutation(
    trpc.aiDraftFiles.saveFiles.mutationOptions({ onSuccess: () => onFilesMutated() }),
  );

  const savedHtml = htmlContents ?? '';
  const savedPython = pythonContents ?? '';

  const [htmlValue, setHtmlValue] = useState(savedHtml);
  const [pythonValue, setPythonValue] = useState(savedPython);
  const isSaving = saveMutation.isPending;
  const saveError = getAppError<AiDraftFilesError['SaveFiles']>(saveMutation.error);

  // Reset the editors to match the saved files when they change externally
  // (after AI updates or a save), discarding any local edits. This adjusts
  // state during render rather than in an effect; see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  //
  // The sibling SelectedQuestionFileEditor instead resets via a remount `key`:
  // it must also clear its save-mutation state (e.g. a STALE_EDIT conflict) on
  // reload, whereas these editors only need to re-sync two text values.
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
      saveMutation.reset();
    },
    getHasChanges: () => hasChanges,
  }));

  function save() {
    if (isSaving || isGenerating || !hasChanges) return;

    saveMutation.mutate({
      questionId,
      files: [
        { path: 'question.html', encodedContents: b64EncodeUnicode(htmlValue) },
        // Clearing `server.py` deletes it: a question with no server-side code
        // shouldn't keep an empty file around.
        {
          path: 'server.py',
          encodedContents: pythonValue.trim() === '' ? null : b64EncodeUnicode(pythonValue),
        },
      ],
    });
  }

  const statusText = isSaving
    ? 'Saving...'
    : hasChanges
      ? 'Unsaved changes.'
      : 'No unsaved changes.';

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
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => void refetchFiles()}
            >
              <i className="fa fa-refresh me-1" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : isGenerating ? (
          <div className="alert alert-info mb-0 py-2 d-flex align-items-center" role="alert">
            <div className="spinner-border spinner-border-sm me-2" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            Editors are read-only while generation is in progress
          </div>
        ) : (
          <div className="d-flex flex-row align-items-center justify-content-between gap-2 ps-2">
            <span className={saveError ? 'text-danger' : undefined}>
              {saveError != null
                ? renderAppError(saveError, {
                    SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
                    UNKNOWN: ({ message }) => message,
                  })
                : statusText}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!hasChanges || isSaving}
              onClick={() => save()}
            >
              {isSaving ? 'Saving...' : 'Save edits'}
            </button>
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
