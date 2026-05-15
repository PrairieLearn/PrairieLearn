import ace from 'ace-builds';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { b64DecodeUnicode, b64EncodeUnicode } from '../../../../lib/base64-util.js';
import type { SelectedQuestionFile } from '../selectedQuestionFile.js';

const SAVE_ERROR_MESSAGE = 'Failed to save edits.';

function getEditErrorUrl(value: unknown) {
  if (typeof value !== 'object' || value == null) return null;
  if (!('editErrorUrl' in value)) return null;

  const { editErrorUrl } = value;
  return typeof editErrorUrl === 'string' ? editErrorUrl : null;
}

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

async function saveSelectedQuestionFile({
  editorUrl,
  csrfToken,
  selectedFile,
  contents,
}: {
  editorUrl: string;
  csrfToken: string;
  selectedFile: SelectedQuestionFile;
  contents: string;
}) {
  const response = await fetch(editorUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      __action: 'submit_file_revision',
      __csrf_token: csrfToken,
      filePath: selectedFile.path,
      contents: b64EncodeUnicode(contents),
    }),
  });

  const data: unknown = await response.json();
  const editErrorUrl = getEditErrorUrl(data);
  if (editErrorUrl) {
    window.location.href = editErrorUrl;
    return false;
  }

  if (!response.ok) {
    throw new Error(SAVE_ERROR_MESSAGE);
  }

  return true;
}

export function SelectedQuestionFileEditor({
  selectedFile,
  csrfToken,
  editorUrl,
  onShowAllFiles,
  onSaved,
}: {
  selectedFile: SelectedQuestionFile;
  csrfToken: string;
  editorUrl: string;
  onShowAllFiles: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const savedContents = b64DecodeUnicode(selectedFile.contents);
  const [contents, setContents] = useState(savedContents);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasChanges = contents !== savedContents;
  const saveStatus = getSaveStatus({ hasChanges, isSaving, saveError });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const saved = await saveSelectedQuestionFile({
        editorUrl,
        csrfToken,
        selectedFile,
        contents,
      });
      if (saved) await onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  // Create Ace after React has mounted the container div.
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const aceBasePath = document.querySelector<HTMLMetaElement>(
      'meta[name="ace-base-path"]',
    )?.content;
    if (aceBasePath) {
      ace.config.set('basePath', aceBasePath);
    }

    const editor = ace.edit(editorContainerRef.current, {
      mode: selectedFile.aceMode,
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    });
    const session = editor.getSession();
    session.setTabSize(2);
    session.setValue(savedContents);
    editor.gotoLine(1, 0, false);
    session.getUndoManager().reset();
    const handleChange = () => setContents(editor.getValue());
    session.on('change', handleChange);

    return () => {
      session.off('change', handleChange);
      editor.destroy();
      editor.container.remove();
    };
  }, [savedContents, selectedFile.aceMode]);

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
          <form method="post" className="mb-0" onSubmit={handleSubmit}>
            <input type="hidden" name="__action" value="submit_file_revision" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="filePath" value={selectedFile.path} />
            <input type="hidden" name="contents" value={b64EncodeUnicode(contents)} />
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
      <div ref={editorContainerRef} className="selected-file-editor-ace flex-grow-1" />
    </div>
  );
}
