import type { UIMessage } from 'ai';

import { html, unsafeHtml } from '@prairielearn/html';
import { hydrateHtml } from '@prairielearn/preact/server';

import { HeadContents } from '../../../components/HeadContents.js';
import { Navbar } from '../../../components/Navbar.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../../lib/assets.js';
import { type AiQuestionGenerationMessage, type Question } from '../../../lib/db-types.js';
import { generateCsrfToken } from '../../../middlewares/csrfToken.js';

import { AiQuestionGenerationEditor } from './components/AiQuestionGenerationEditor.js';

export function InstructorAiGenerateDraftEditor({
  resLocals,
  question,
  messages,
  questionFiles,
  richTextEditorEnabled,
  questionContainerHtml,
}: {
  resLocals: Record<string, any>;
  question: Question;
  messages: AiQuestionGenerationMessage[];
  questionFiles: Record<string, string>;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
}) {
  const initialMessages = messages.map((message): UIMessage => {
    return {
      id: message.id,
      role: message.role,
      parts: message.parts,
      metadata: {
        job_sequence_id: message.job_sequence_id,
        status: message.status,
      },
    };
  });

  const chatCsrfToken = generateCsrfToken({
    url: `${resLocals.urlPrefix}/ai_generate_editor/${question.id}/chat`,
    authn_user_id: resLocals.authn_user?.user_id ?? '',
  });

  // This page has a very custom layout, so we don't use the usual `PageLayout`
  // component here. If we start building other similar pages, we might want to
  // teach `PageLayout` how to render this kind of layout.
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta
          name="ace-base-path"
          content="${nodeModulesAssetPath('ace-builds/src-min-noconflict/')}"
        />
        ${[
          HeadContents({ resLocals }),
          compiledScriptTag('question.ts'),
          compiledStylesheetTag('instructorAiGenerateDraftEditor.css'),
        ]}
        <script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>
        ${unsafeHtml(resLocals.extraHeadersHtml)}
      </head>
      <body hx-ext="loading-states">
        <div class="app-container" style="--chat-width: 400px;">
          <div class="app-grid">
            <div class="app-navbar">
              ${Navbar({
                navPage: 'course_admin',
                navSubPage: 'questions',
                resLocals,
                marginBottom: false,
              })}
            </div>
            ${hydrateHtml(
              <AiQuestionGenerationEditor
                question={question}
                initialMessages={initialMessages}
                questionFiles={questionFiles}
                richTextEditorEnabled={richTextEditorEnabled}
                urlPrefix={resLocals.urlPrefix}
                csrfToken={resLocals.__csrf_token}
                chatCsrfToken={chatCsrfToken}
                resLocals={resLocals}
                questionContainerHtml={questionContainerHtml}
              />,
              { class: 'app-content-container' },
            )}
          </div>
        </div>
      </body>
    </html>
  `.toString();
}
