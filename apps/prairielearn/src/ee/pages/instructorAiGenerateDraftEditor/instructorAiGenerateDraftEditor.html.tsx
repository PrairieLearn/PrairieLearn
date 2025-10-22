import type { UIMessage } from 'ai';

import { html, unsafeHtml } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../../components/PageLayout.js';
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

  return PageLayout({
    resLocals,
    pageTitle: 'AI Question Editor',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
    },
    options: {
      fullWidth: true,
      fullHeight: true,
      contentPadding: false,
      hxExt: 'loading-states',
    },
    headContent: [
      compiledScriptTag('question.ts'),
      compiledStylesheetTag('instructorAiGenerateDraftEditor.css'),
      html`<script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>`,
      unsafeHtml(resLocals.extraHeadContentHtml),
    ],
    content: (
      <Hydrate class="app-content-container">
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
        />
      </Hydrate>
    ),
  });
}
