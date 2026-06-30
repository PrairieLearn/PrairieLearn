import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { Modal } from 'react-bootstrap';

import { AceFileEditor } from '../../../../components/AceFileEditor.js';
import { b64DecodeUnicode, b64EncodeUnicode } from '../../../../lib/base64-util.js';
import {
  getAppError,
  renderAppError,
  syncJobFailedRenderer,
} from '../../../../lib/client/errors.js';
import type { DraftQuestionSelectedFile } from '../../../../lib/draft-question-files/browser.js';
import type { AiDraftFilesError } from '../../../../trpc/course/ai-draft-files.js';
import { useTRPC } from '../../../../trpc/course/context.js';

import { DraftQuestionFileBrowserBreadcrumb } from './DraftQuestionFileBrowserBreadcrumb.js';
import { useDraftFiles, useRegisterDraftEditor } from './draftFilesContext.js';
import { useDraftFileNavigation } from './useDraftFileNavigation.js';
import { useRefetchDraftFiles } from './useRefetchDraftFiles.js';

function getSaveStatus({
  hasChanges,
  isSaving,
  isGenerating,
}: {
  hasChanges: boolean;
  isSaving: boolean;
  isGenerating: boolean;
}) {
  if (isSaving) return 'Saving...';
  if (isGenerating) return 'Read-only while generation is in progress.';
  if (hasChanges) return 'Unsaved changes.';
  return 'Saved.';
}

export function SelectedQuestionFileEditor({
  selectedFile,
}: {
  selectedFile: Extract<DraftQuestionSelectedFile, { kind: 'editor' }>;
}) {
  const trpc = useTRPC();
  const { questionId, urlPrefix, isGenerating, onFileMutated } = useDraftFiles();
  const { selectDirectory } = useDraftFileNavigation();
  const refetchDraftFiles = useRefetchDraftFiles();
  const saveMutation = useMutation(
    trpc.aiDraftFiles.save.mutationOptions({ onSuccess: () => onFileMutated() }),
  );
  const savedContents = b64DecodeUnicode(selectedFile.encodedContents);
  const [contents, setContents] = useState(savedContents);
  const [isReloading, setIsReloading] = useState(false);
  const [pendingDirectory, setPendingDirectory] = useState<{
    directory: string | null;
  } | null>(null);
  const isSaving = saveMutation.isPending;
  const saveError = getAppError<AiDraftFilesError['Save']>(saveMutation.error);
  const hasChanges = contents !== savedContents;
  const hasConflict = saveError?.code === 'STALE_EDIT';
  const saveStatus = getSaveStatus({ hasChanges, isSaving, isGenerating });

  useRegisterDraftEditor({
    getHasChanges: () => hasChanges,
    discardChanges: () => {
      setContents(savedContents);
      saveMutation.reset();
    },
  });

  /** Leaving unmounts the editor and drops unsaved edits, so confirm first. */
  function handleSelectDirectory(directory: string | null) {
    if (hasChanges) {
      setPendingDirectory({ directory });
    } else {
      void selectDirectory(directory);
    }
  }

  function confirmDiscard() {
    const target = pendingDirectory;
    setPendingDirectory(null);
    if (target) void selectDirectory(target.directory);
  }

  /** `force` overwrites a concurrent change after a `STALE_EDIT` conflict. */
  function save(force: boolean) {
    if (isSaving || isGenerating) return;

    saveMutation.mutate({
      questionId,
      files: [
        {
          path: selectedFile.path,
          encodedContents: b64EncodeUnicode(contents),
          origHash: selectedFile.contentHash,
        },
      ],
      force,
    });
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges) return;
    save(false);
  }

  async function handleReload() {
    if (isReloading) return;
    setIsReloading(true);
    try {
      // On success the file refetches with a new content hash, remounting this
      // component with the disk contents; the `finally` only matters otherwise.
      await refetchDraftFiles();
    } finally {
      setIsReloading(false);
    }
  }

  return (
    <div
      className="selected-file-editor h-100 d-flex flex-column"
      data-testid="selected-file-editor"
    >
      <div className="selected-file-editor-toolbar d-flex align-items-center justify-content-between gap-2 border-bottom bg-light px-3 py-2">
        <div className="min-width-0">
          <DraftQuestionFileBrowserBreadcrumb
            selection={{ kind: 'file', path: selectedFile.path }}
            ariaLabel="Selected file breadcrumb"
            onSelectDirectory={handleSelectDirectory}
          />
          <div className={`small ${saveError ? 'text-danger' : 'text-muted'}`}>
            {saveError != null
              ? renderAppError(saveError, {
                  SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
                  STALE_EDIT: ({ message }) => (
                    <>
                      {message} Your edits are kept.{' '}
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 align-baseline"
                        disabled={isSaving || isReloading}
                        onClick={() => void handleReload()}
                      >
                        Reload file
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
              : saveStatus}
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <form className="mb-0" onSubmit={handleSubmit}>
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={!hasChanges || isSaving || isGenerating || hasConflict}
            >
              {isSaving ? 'Saving...' : 'Save edits'}
            </button>
          </form>
        </div>
      </div>
      <AceFileEditor
        value={contents}
        mode={selectedFile.aceMode}
        readOnly={isGenerating}
        className="selected-file-editor-ace flex-grow-1"
        onChange={setContents}
        onReady={(editor) => {
          editor.getSession().setTabSize(2);
          if (selectedFile.lintHtmlMustache) {
            document.dispatchEvent(
              new CustomEvent('pl:html-mustache-linter-attach', {
                detail: { editor },
              }),
            );
          }
        }}
      />
      <Modal show={pendingDirectory != null} onHide={() => setPendingDirectory(null)}>
        <Modal.Header closeButton>
          <Modal.Title>Unsaved changes</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0">
            You have unsaved changes to this file. If you leave, your changes will be discarded.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPendingDirectory(null)}
          >
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={confirmDiscard}>
            Discard changes
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
