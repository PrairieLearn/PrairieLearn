import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';

import { AceFileEditor } from '../../../../components/AceFileEditor.js';
import { b64DecodeUnicode, b64EncodeUnicode } from '../../../../lib/base64-util.js';
import { useTRPC } from '../../../../trpc/course/context.js';
import type { SelectedQuestionFile } from '../selectedQuestionFile.js';

const SAVE_ERROR_MESSAGE = 'Failed to save edits.';

function getSaveStatus({
  hasChanges,
  isSaving,
  saveError,
}: {
  hasChanges: boolean;
  isSaving: boolean;
  saveError: string | null;
}) {
  if (saveError) return saveError;
  if (isSaving) return 'Saving...';
  if (hasChanges) return 'Unsaved changes.';
  return 'Saved.';
}

export function SelectedQuestionFileEditor({
  selectedFile,
  questionId,
  urlPrefix,
  onShowAllFiles,
  onSaved,
}: {
  selectedFile: SelectedQuestionFile;
  questionId: string;
  urlPrefix: string;
  onShowAllFiles: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const saveMutation = useMutation(trpc.aiDraftFiles.save.mutationOptions());
  const savedContents = b64DecodeUnicode(selectedFile.contents);
  const [contents, setContents] = useState(savedContents);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasChanges = contents !== savedContents;
  const saveStatus = getSaveStatus({ hasChanges, isSaving, saveError });

  // Refetched file data replaces the editor's saved baseline after a save or file selection.
  useEffect(() => {
    setContents(savedContents);
    setSaveError(null);
  }, [savedContents]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const result = await saveMutation.mutateAsync({
        questionId,
        urlPrefix,
        filePath: selectedFile.path,
        contents: b64EncodeUnicode(contents),
      });
      if (result.status === 'error') {
        window.location.href = result.editErrorUrl;
        return;
      }
      await onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="selected-file-editor h-100 d-flex flex-column">
      <div className="selected-file-editor-toolbar d-flex align-items-center justify-content-between gap-2 border-bottom bg-light px-3 py-2">
        <div className="min-width-0">
          <div className="font-monospace text-truncate">{selectedFile.path}</div>
          <div className={`small ${saveError ? 'text-danger' : 'text-muted'}`}>{saveStatus}</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={onShowAllFiles}
          >
            All files
          </button>
          <form className="mb-0" onSubmit={handleSubmit}>
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={!hasChanges || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save edits'}
            </button>
          </form>
        </div>
      </div>
      <AceFileEditor
        value={contents}
        mode={selectedFile.aceMode}
        className="selected-file-editor-ace flex-grow-1"
        onChange={setContents}
        onReady={(editor) => editor.getSession().setTabSize(2)}
      />
    </div>
  );
}
