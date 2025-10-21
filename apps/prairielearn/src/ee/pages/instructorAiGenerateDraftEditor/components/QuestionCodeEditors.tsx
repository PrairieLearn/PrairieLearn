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
  return (
    <div class="editor-panes p-2 gap-2">
      {/* TODO: Move this to a more sensible location */}
      <div class="editor-pane-status">
        <div class="d-flex flex-row align-items-center justify-content-between ps-2">
          <span class="js-editor-status">No unsaved changes.</span>
          <form method="post" class="js-editor-form">
            <input type="hidden" name="__action" value="submit_manual_revision" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <button type="submit" class="btn btn-sm btn-primary">
              Save edits
            </button>
            <input
              type="hidden"
              class="js-file-editor-contents"
              name="html"
              value={b64EncodeUnicode(htmlContents ?? '')}
            />
            <input
              type="hidden"
              class="js-file-editor-contents"
              name="python"
              value={b64EncodeUnicode(pythonContents ?? '')}
            />
          </form>
        </div>
      </div>
      <div class="editor-pane-html d-flex flex-column border rounded" style="overflow: hidden">
        <div class="py-2 px-3 font-monospace bg-light">question.html</div>
        <div
          class="js-file-editor flex-grow-1"
          data-ace-mode="ace/mode/html"
          data-input-contents-name="html"
        />
      </div>
      <div class="editor-pane-python d-flex flex-column border rounded" style="overflow: hidden">
        <div class="py-2 px-3 font-monospace bg-light">server.py</div>
        <div
          class="js-file-editor flex-grow-1"
          data-ace-mode="ace/mode/python"
          data-input-contents-name="python"
        />
      </div>
    </div>
  );
}
