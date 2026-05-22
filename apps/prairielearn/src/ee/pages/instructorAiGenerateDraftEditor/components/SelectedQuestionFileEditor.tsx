import { useMutation } from '@tanstack/react-query';
import { type FormEvent, type Ref, useEffect, useImperativeHandle, useState } from 'react';

import { AceFileEditor } from '../../../../components/AceFileEditor.js';
import { b64DecodeUnicode, b64EncodeUnicode } from '../../../../lib/base64-util.js';
import { getAppError } from '../../../../lib/client/errors.js';
import type { SelectedQuestionFile } from '../../../../lib/draft-question-files.js';
import type { AiDraftFilesError } from '../../../../trpc/shared/ai-draft-files.js';

import { useTRPC } from './aiDraftFilesTrpc.js';

const SAVE_ERROR_MESSAGE = 'Failed to save edits.';

export interface SelectedQuestionFileEditorHandle {
  discardChanges: () => void;
}

export function SelectedQuestionFileBreadcrumb({
  filePath,
  allFilesHref,
  onShowAllFiles,
}: {
  filePath: string;
  allFilesHref: string;
  onShowAllFiles: () => void;
}) {
  return (
    <nav
      aria-label="Selected file breadcrumb"
      className="d-flex align-items-baseline min-width-0 font-monospace"
    >
      <a
        href={allFilesHref}
        className="flex-shrink-0"
        onClick={(event) => {
          event.preventDefault();
          onShowAllFiles();
        }}
      >
        All files
      </a>
      <span className="mx-1 text-muted">/</span>
      <span className="text-truncate">{filePath}</span>
    </nav>
  );
}

function getSaveStatus({
  hasChanges,
  isSaving,
  saveError,
  isGenerating,
}: {
  hasChanges: boolean;
  isSaving: boolean;
  saveError: string | null;
  isGenerating: boolean;
}) {
  if (saveError) return saveError;
  if (isSaving) return 'Saving...';
  if (isGenerating) return 'Read-only while generation is in progress.';
  if (hasChanges) return 'Unsaved changes.';
  return 'Saved.';
}

export function SelectedQuestionFileEditor({
  selectedFile,
  questionId,
  isGenerating,
  allFilesHref,
  onShowAllFiles,
  onSaved,
  onHasChangesChange,
  editorRef,
}: {
  selectedFile: SelectedQuestionFile;
  questionId: string;
  isGenerating: boolean;
  allFilesHref: string;
  onShowAllFiles: () => void;
  onSaved: () => Promise<unknown>;
  onHasChangesChange?: (hasChanges: boolean) => void;
  editorRef?: Ref<SelectedQuestionFileEditorHandle>;
}) {
  const trpc = useTRPC();
  const saveMutation = useMutation(trpc.aiDraftFiles.save.mutationOptions());
  const savedContents = b64DecodeUnicode(selectedFile.encodedContents);
  const [contents, setContents] = useState(savedContents);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasChanges = contents !== savedContents;
  const saveStatus = getSaveStatus({ hasChanges, isSaving, saveError, isGenerating });

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent, react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    onHasChangesChange?.(hasChanges);
  }, [hasChanges, onHasChangesChange]);

  useImperativeHandle(editorRef, () => ({
    discardChanges: () => {
      setContents(savedContents);
      setSaveError(null);
    },
  }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || isSaving || isGenerating) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const result = await saveMutation.mutateAsync({
        questionId,
        filePath: selectedFile.path,
        encodedContents: b64EncodeUnicode(contents),
      });
      if (result.status === 'error') {
        window.location.href = result.editErrorUrl;
        return;
      }
      await onSaved();
    } catch (err) {
      setSaveError(getAppError<AiDraftFilesError['Save']>(err)?.message ?? SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="selected-file-editor h-100 d-flex flex-column">
      <div className="selected-file-editor-toolbar d-flex align-items-center justify-content-between gap-2 border-bottom bg-light px-3 py-2">
        <div className="min-width-0">
          <SelectedQuestionFileBreadcrumb
            filePath={selectedFile.path}
            allFilesHref={allFilesHref}
            onShowAllFiles={onShowAllFiles}
          />
          <div className={`small ${saveError ? 'text-danger' : 'text-muted'}`}>{saveStatus}</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <form className="mb-0" onSubmit={handleSubmit}>
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={!hasChanges || isSaving || isGenerating}
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
    </div>
  );
}
