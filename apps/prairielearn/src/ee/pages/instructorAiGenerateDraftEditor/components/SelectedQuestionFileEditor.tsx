import ace from 'ace-builds';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { b64DecodeUnicode, b64EncodeUnicode } from '../../../../lib/base64-util.js';
import type { SelectedQuestionFile } from '../selectedQuestionFile.js';

function getEditErrorUrl(value: unknown) {
  if (typeof value !== 'object' || value == null) return null;
  if (!('editErrorUrl' in value)) return null;

  const { editErrorUrl } = value;
  return typeof editErrorUrl === 'string' ? editErrorUrl : null;
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
  const editorInstanceRef = useRef<ace.Ace.Editor | null>(null);
  const savedContents = b64DecodeUnicode(selectedFile.contents);
  const [contents, setContents] = useState(savedContents);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasChanges = contents !== savedContents;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    setSaveError(null);

    const body = new URLSearchParams({
      __action: 'submit_file_revision',
      __csrf_token: csrfToken,
      filePath: selectedFile.path,
      contents: b64EncodeUnicode(contents),
    });

    try {
      const response = await fetch(editorUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      const data: unknown = await response.json();
      const editErrorUrl = getEditErrorUrl(data);
      if (editErrorUrl) {
        window.location.href = editErrorUrl;
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to save edits.');
      }

      await onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save edits.');
    } finally {
      setIsSaving(false);
    }
  }

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
    editor.getSession().setTabSize(2);
    editor.getSession().setValue(savedContents);
    editor.gotoLine(1, 0, false);
    editor.getSession().getUndoManager().reset();
    editor.getSession().on('change', () => setContents(editor.getValue()));
    editorInstanceRef.current = editor;

    return () => {
      editor.destroy();
      editorInstanceRef.current = null;
    };
  }, [savedContents, selectedFile.aceMode]);

  return (
    <div className="selected-file-editor h-100 d-flex flex-column">
      <div className="selected-file-editor-toolbar d-flex align-items-center justify-content-between gap-2 border-bottom bg-light px-3 py-2">
        <div className="min-width-0">
          <div className="font-monospace text-truncate">{selectedFile.path}</div>
          <div className={`small ${saveError ? 'text-danger' : 'text-muted'}`}>
            {saveError ?? (isSaving ? 'Saving...' : hasChanges ? 'Unsaved changes.' : 'Saved.')}
          </div>
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
