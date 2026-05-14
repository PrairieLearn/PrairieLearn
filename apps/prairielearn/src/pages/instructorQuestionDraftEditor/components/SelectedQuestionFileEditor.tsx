import ace from 'ace-builds';
import { useEffect, useRef, useState } from 'react';

import { b64DecodeUnicode, b64EncodeUnicode } from '../../../lib/base64-util.js';

export interface SelectedQuestionFile {
  path: string;
  contents: string;
  aceMode: string;
}

export function SelectedQuestionFileEditor({
  selectedFile,
  csrfToken,
  editorUrl,
  isGenerating,
}: {
  selectedFile: SelectedQuestionFile;
  csrfToken: string;
  editorUrl: string;
  isGenerating: boolean;
}) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<ace.Ace.Editor | null>(null);
  const savedContents = b64DecodeUnicode(selectedFile.contents);
  const [value, setValue] = useState(savedContents);
  const hasChanges = value !== savedContents;

  // The Ace editor owns its DOM, so it must be initialized after React mounts the container.
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
      wrap: true,
      showPrintMargin: false,
    });
    editor.getSession().setValue(savedContents);
    editor.gotoLine(1, 0, false);
    editor.getSession().on('change', () => setValue(editor.getValue()));
    editorInstanceRef.current = editor;

    return () => {
      editor.destroy();
      editorInstanceRef.current = null;
    };
  }, [savedContents, selectedFile.aceMode]);

  // Keep the editor read-only while the AI agent is modifying files.
  useEffect(() => {
    editorInstanceRef.current?.setReadOnly(isGenerating);
  }, [isGenerating]);

  return (
    <div className="selected-file-editor h-100 d-flex flex-column">
      <div className="selected-file-editor-toolbar d-flex align-items-center justify-content-between gap-2 border-bottom bg-light px-3 py-2">
        <div className="min-width-0">
          <div className="font-monospace text-truncate">{selectedFile.path}</div>
          <div className="small text-muted">
            {hasChanges ? 'Unsaved changes.' : 'No unsaved changes.'}
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <a href={editorUrl} className="btn btn-sm btn-outline-secondary text-nowrap">
            All files
          </a>
          <form method="post" className="mb-0">
            <input type="hidden" name="__action" value="submit_file_revision" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="filePath" value={selectedFile.path} />
            <input type="hidden" name="contents" value={b64EncodeUnicode(value)} />
            <button
              type="submit"
              className="btn btn-sm btn-primary text-nowrap"
              disabled={!hasChanges || isGenerating}
            >
              Save edits
            </button>
          </form>
        </div>
      </div>
      {isGenerating && (
        <div
          className="alert alert-info rounded-0 mb-0 py-2 d-flex align-items-center"
          role="alert"
        >
          <div className="spinner-border spinner-border-sm me-2" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          Editor is read-only while generation is in progress
        </div>
      )}
      <div ref={editorContainerRef} className="selected-file-editor-ace flex-grow-1" />
    </div>
  );
}
