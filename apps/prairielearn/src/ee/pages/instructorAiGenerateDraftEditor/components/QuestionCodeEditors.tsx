import ace from 'ace-builds';
import { useEffect, useRef, useState } from 'preact/hooks';

import { b64EncodeUnicode } from '../../../../lib/base64-util.js';

export function QuestionCodeEditors({
  htmlContents,
  pythonContents,
  csrfToken,
}: {
  htmlContents: string | null;
  pythonContents: string | null;
  csrfToken: string;
}) {
  const htmlEditorRef = useRef<HTMLDivElement>(null);
  const pythonEditorRef = useRef<HTMLDivElement>(null);
  const htmlEditorInstanceRef = useRef<ace.Ace.Editor | null>(null);
  const pythonEditorInstanceRef = useRef<ace.Ace.Editor | null>(null);

  const [htmlValue, setHtmlValue] = useState(htmlContents ?? '');
  const [pythonValue, setPythonValue] = useState(pythonContents ?? '');
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize ACE editors.
  // TODO: this doesn't have any sensible undo story. Should it?
  useEffect(() => {
    if (!htmlEditorRef.current || !pythonEditorRef.current) return;

    // Configure ACE base path from meta tag
    const aceBasePath = document.querySelector<HTMLMetaElement>(
      'meta[name="ace-base-path"]',
    )?.content;
    if (aceBasePath) {
      ace.config.set('basePath', aceBasePath);
    }

    // Initialize HTML editor
    const htmlEditor = ace.edit(htmlEditorRef.current, {
      mode: 'ace/mode/html',
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    });
    htmlEditor.getSession().setValue(htmlContents ?? '');
    htmlEditor.getSession().setTabSize(2);
    htmlEditor.gotoLine(1, 0, false);
    htmlEditorInstanceRef.current = htmlEditor;

    // Initialize Python editor
    const pythonEditor = ace.edit(pythonEditorRef.current, {
      mode: 'ace/mode/python',
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    });
    pythonEditor.getSession().setValue(pythonContents ?? '');
    pythonEditor.gotoLine(1, 0, false);
    pythonEditorInstanceRef.current = pythonEditor;

    // Track changes
    const handleHtmlChange = () => {
      const newValue = htmlEditor.getValue();
      setHtmlValue(newValue);
      setHasChanges(
        newValue !== (htmlContents ?? '') || pythonEditor.getValue() !== (pythonContents ?? ''),
      );
    };

    const handlePythonChange = () => {
      const newValue = pythonEditor.getValue();
      setPythonValue(newValue);
      setHasChanges(
        htmlEditor.getValue() !== (htmlContents ?? '') || newValue !== (pythonContents ?? ''),
      );
    };

    htmlEditor.getSession().on('change', handleHtmlChange);
    pythonEditor.getSession().on('change', handlePythonChange);

    return () => {
      htmlEditor.destroy();
      pythonEditor.destroy();
    };
  }, [htmlContents, pythonContents]);

  return (
    <div class="editor-panes p-2 gap-2">
      {/* TODO: Move this to a more sensible location */}
      <div class="editor-pane-status">
        <div class="d-flex flex-row align-items-center justify-content-between ps-2">
          <span>{hasChanges ? 'Unsaved changes.' : 'No unsaved changes.'}</span>
          <form method="post">
            <input type="hidden" name="__action" value="submit_manual_revision" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <button type="submit" class="btn btn-sm btn-primary" disabled={!hasChanges}>
              Save edits
            </button>
            <input type="hidden" name="html" value={b64EncodeUnicode(htmlValue)} />
            <input type="hidden" name="python" value={b64EncodeUnicode(pythonValue)} />
          </form>
        </div>
      </div>
      <div class="editor-pane-html d-flex flex-column border rounded" style="overflow: hidden">
        <div class="py-2 px-3 font-monospace bg-light">question.html</div>
        <div ref={htmlEditorRef} class="flex-grow-1" />
      </div>
      <div class="editor-pane-python d-flex flex-column border rounded" style="overflow: hidden">
        <div class="py-2 px-3 font-monospace bg-light">server.py</div>
        <div ref={pythonEditorRef} class="flex-grow-1" />
      </div>
    </div>
  );
}
