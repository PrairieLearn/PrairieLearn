import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { AceFileEditor } from '../../../../components/AceFileEditor.js';
import { b64DecodeUnicode, b64EncodeUnicode } from '../../../../lib/base64-util.js';
import {
  type AppError,
  getAppError,
  renderAppError,
  syncJobFailedRenderer,
} from '../../../../lib/client/errors.js';
import type { DraftQuestionFileContent } from '../../../../lib/draft-question-files/browser.js';
import type { AiDraftFilesError } from '../../../../trpc/course/ai-draft-files.js';
import { useTRPC } from '../../../../trpc/course/context.js';

import { useDraftFiles, useRegisterDraftEditor } from './draftFilesContext.js';
import { useRefetchDraftFiles } from './useRefetchDraftFiles.js';

export function QuestionCodeEditors({
  htmlFile,
  pythonFile,
  filesError,
  onFileMutated,
}: {
  /** The fetched `question.html`, or `null` if the file doesn't exist. */
  htmlFile: DraftQuestionFileContent | null;
  /** The fetched `server.py`, or `null` if the file doesn't exist. */
  pythonFile: DraftQuestionFileContent | null;
  filesError: AppError<AiDraftFilesError['Contents']> | null;
  onFileMutated: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const { questionId, urlPrefix, isGenerating } = useDraftFiles();
  const refetchDraftFiles = useRefetchDraftFiles();
  const saveMutation = useMutation(
    trpc.aiDraftFiles.save.mutationOptions({ onSuccess: () => onFileMutated() }),
  );

  const savedHtml = htmlFile ? b64DecodeUnicode(htmlFile.encodedContents) : '';
  const savedPython = pythonFile ? b64DecodeUnicode(pythonFile.encodedContents) : '';

  const [htmlValue, setHtmlValue] = useState(savedHtml);
  const [pythonValue, setPythonValue] = useState(savedPython);
  const [isReloading, setIsReloading] = useState(false);
  const isSaving = saveMutation.isPending;
  const saveError = getAppError<AiDraftFilesError['Save']>(saveMutation.error);
  const hasConflict = saveError?.code === 'STALE_EDIT';

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

  useRegisterDraftEditor({
    getHasChanges: () => hasChanges,
    discardChanges: () => {
      setHtmlValue(savedHtml);
      setPythonValue(savedPython);
      saveMutation.reset();
    },
  });

  /** `force` overwrites a concurrent change after a `STALE_EDIT` conflict. */
  function save(force: boolean) {
    if (isSaving || isGenerating) return;
    if (!force && !hasChanges) return;

    // Both files are sent with the hash of the contents they were fetched
    // with: the server skips an unedited file entirely and rejects the save
    // if an edited file changed on disk since it was fetched.
    saveMutation.mutate({
      questionId,
      files: [
        {
          path: 'question.html',
          encodedContents: b64EncodeUnicode(htmlValue),
          origHash: htmlFile?.hash ?? null,
        },
        // Clearing `server.py` deletes it: a question with no server-side code
        // shouldn't keep an empty file around.
        {
          path: 'server.py',
          encodedContents: pythonValue.trim() === '' ? null : b64EncodeUnicode(pythonValue),
          origHash: pythonFile?.hash ?? null,
        },
      ],
      force,
    });
  }

  /** Drops the conflict and re-fetches; the editors re-sync to the new disk state. */
  async function handleReload() {
    if (isReloading) return;
    setIsReloading(true);
    try {
      await refetchDraftFiles();
      saveMutation.reset();
    } finally {
      setIsReloading(false);
    }
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
              <strong>Error loading files:</strong>{' '}
              {renderAppError(filesError, { UNKNOWN: ({ message }) => message })}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => void refetchDraftFiles()}
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
                    STALE_EDIT: ({ filePath, reason }) => (
                      <>
                        {filePath ? <code>{filePath}</code> : 'A file'}{' '}
                        {reason === 'deleted' ? 'was deleted' : 'changed'} since you opened it. Your
                        edits are kept.{' '}
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 align-baseline"
                          disabled={isSaving || isReloading}
                          onClick={() => void handleReload()}
                        >
                          Reload files
                        </button>{' '}
                        or{' '}
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 align-baseline"
                          disabled={isSaving || isReloading}
                          onClick={() => save(true)}
                        >
                          overwrite anyway
                        </button>
                        .
                      </>
                    ),
                    UNKNOWN: ({ message }) => message,
                  })
                : statusText}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!hasChanges || isSaving || hasConflict}
              onClick={() => save(false)}
            >
              {isSaving ? 'Saving...' : 'Save edits'}
            </button>
          </div>
        )}
      </div>
      <div
        className="editor-pane-html d-flex flex-column border rounded"
        style={{ overflow: 'hidden' }}
        data-testid="question-html-editor"
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
