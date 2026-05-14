import ace from 'ace-builds';
import { useEffect, useRef, useState } from 'react';

import { b64DecodeUnicode, b64EncodeUnicode } from '../../../../lib/base64-util.js';
import type { SelectedQuestionFile } from '../selectedQuestionFile.js';

export function SelectedQuestionFileEditor({
  selectedFile,
  csrfToken,
  editorUrl,
}: {
  selectedFile: SelectedQuestionFile;
  csrfToken: string;
  editorUrl: string;
}) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<ace.Ace.Editor | null>(null);
  const savedContents = b64DecodeUnicode(selectedFile.contents);
  const [contents, setContents] = useState(savedContents);
  const hasChanges = contents !== savedContents;
  const allFilesUrl = `${editorUrl}?tab=all-files`;

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
          <div className="small text-muted">{hasChanges ? 'Unsaved changes.' : 'Saved.'}</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <a className="btn btn-sm btn-outline-secondary" href={allFilesUrl}>
            All files
          </a>
          <form method="post" className="mb-0">
            <input type="hidden" name="__action" value="submit_file_revision" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <input type="hidden" name="filePath" value={selectedFile.path} />
            <input type="hidden" name="contents" value={b64EncodeUnicode(contents)} />
            <button type="submit" className="btn btn-sm btn-primary" disabled={!hasChanges}>
              Save edits
            </button>
          </form>
        </div>
      </div>
      <div ref={editorContainerRef} className="selected-file-editor-ace flex-grow-1" />
    </div>
  );
}
