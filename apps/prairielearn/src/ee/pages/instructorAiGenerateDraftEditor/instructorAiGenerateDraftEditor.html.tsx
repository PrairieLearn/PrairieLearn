import { html, unsafeHtml } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../../components/PageLayout.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../../lib/assets.js';
import { type Question } from '../../../lib/db-types.js';
import type { UntypedResLocals } from '../../../lib/res-locals.types.js';
import { generateCsrfToken } from '../../../middlewares/csrfToken.js';
import type { QuestionGenerationUIMessage } from '../../lib/ai-question-generation/agent.js';

import { AiQuestionGenerationEditor } from './components/AiQuestionGenerationEditor.js';

export function InstructorAiGenerateDraftEditor({
  resLocals,
  question,
  messages,
  questionFiles,
  richTextEditorEnabled,
  questionContainerHtml,
}: {
  resLocals: UntypedResLocals;
  question: Question;
  messages: QuestionGenerationUIMessage[];
  questionFiles: Record<string, string>;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
}) {
  const chatCsrfToken = generateCsrfToken({
    url: `${resLocals.urlPrefix}/ai_generate_editor/${question.id}/chat`,
    authnUserId: resLocals.authn_user?.user_id ?? '',
  });

  const variantUrl = `${resLocals.urlPrefix}/ai_generate_editor/${question.id}/variant`;
  const variantCsrfToken = generateCsrfToken({
    url: variantUrl,
    authnUserId: resLocals.authn_user?.user_id ?? '',
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
      // Hide the sidebar by default. We want to maximize the horizontal space for the editor.
      // This will also prevent persisting sidebar state changes.
      forcedInitialNavToggleState: false,
    },
    headContent: [
      compiledScriptTag('question.ts'),
      compiledStylesheetTag('instructorAiGenerateDraftEditor.css'),
      html`<script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>`,
      unsafeHtml(resLocals.extraHeadContentHtml),
      html`
        <meta
          name="ace-base-path"
          content="${nodeModulesAssetPath('ace-builds/src-min-noconflict/')}"
        />
      `,
    ],
    content: (
      <Hydrate class="app-content-container">
        <AiQuestionGenerationEditor
          question={question}
          initialMessages={messages}
          questionFiles={questionFiles}
          richTextEditorEnabled={richTextEditorEnabled}
          urlPrefix={resLocals.urlPrefix}
          csrfToken={resLocals.__csrf_token}
          chatCsrfToken={chatCsrfToken}
          questionContainerHtml={questionContainerHtml}
          showJobLogsLink={resLocals.is_administrator}
          variantUrl={variantUrl}
          variantCsrfToken={variantCsrfToken}
        />
      </Hydrate>
    ),
  });
}
