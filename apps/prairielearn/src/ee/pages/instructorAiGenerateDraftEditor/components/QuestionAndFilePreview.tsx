import { b64DecodeUnicode } from '../../../../lib/base64-util.js';
import RichTextEditor from '../RichTextEditor/index.js';

import { QuestionCodeEditors } from './QuestionCodeEditors.js';

export function QuestionAndFilePreview({
  questionFiles,
  richTextEditorEnabled,
  questionContainerHtml,
  csrfToken,
}: {
  questionFiles: Record<string, string>;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
  csrfToken: string;
}) {
  return (
    <div class="tab-content" style="height: 100%">
      <div role="tabpanel" id="question-preview" class="tab-pane active" style="height: 100%">
        <div
          class="question-wrapper mx-auto p-3"
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{ __html: questionContainerHtml }}
        />
      </div>
      <div role="tabpanel" id="question-code" class="tab-pane" style="height: 100%">
        <QuestionCodeEditors
          htmlContents={b64DecodeUnicode(questionFiles['question.html'] || '')}
          pythonContents={b64DecodeUnicode(questionFiles['server.py'] || '')}
          csrfToken={csrfToken}
        />
      </div>
      <div role="tabpanel" id="question-rich-text-editor" class="tab-pane" style="height: 100%">
        {richTextEditorEnabled && (
          <RichTextEditor
            htmlContents={b64DecodeUnicode(questionFiles['question.html'])}
            csrfToken={csrfToken}
          />
        )}
      </div>
    </div>
  );
}
