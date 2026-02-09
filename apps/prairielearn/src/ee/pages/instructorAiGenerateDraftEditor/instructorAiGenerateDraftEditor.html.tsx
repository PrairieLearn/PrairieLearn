import { html, unsafeHtml } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../../components/PageLayout.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../../lib/assets.js';
import { StaffQuestionSchema } from '../../../lib/client/safe-db-types.js';
import { getAiQuestionGenerationDraftsUrl } from '../../../lib/client/url.js';
import { config } from '../../../lib/config.js';
import { type Question } from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
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
  resLocals: ResLocalsForPage<'instructor-question'>;
  question: Question;
  messages: QuestionGenerationUIMessage[];
  questionFiles: Record<string, string>;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
}) {
  const chatCsrfToken = generatePrefixCsrfToken(
    {
      url: `${resLocals.urlPrefix}/ai_generate_editor/${question.id}/chat`,
      authn_user_id: resLocals.authn_user.id,
    },
    config.secretKey,
  );

  const variantUrl = `${resLocals.urlPrefix}/ai_generate_editor/${question.id}/variant`;
  const variantCsrfToken = generateCsrfToken({
    url: variantUrl,
    authnUserId: resLocals.authn_user.id,
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
      html`<meta
        name="mathjax-fonts-path"
        content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
      />`,
      compiledScriptTag('question.ts'),
      compiledStylesheetTag('instructorAiGenerateDraftEditor.css'),
      html`<script defer src="${nodeModulesAssetPath('mathjax/tex-svg.js')}"></script>`,
      unsafeHtml(resLocals.extraHeadersHtml),
      html`
        <meta
          name="ace-base-path"
          content="${nodeModulesAssetPath('ace-builds/src-min-noconflict/')}"
        />
      `,
    ],
    content: (
      <Hydrate className="app-content-container">
        <AiQuestionGenerationEditor
          chatCsrfToken={chatCsrfToken}
          question={StaffQuestionSchema.parse(question)}
          initialMessages={messages}
          questionFiles={questionFiles}
          richTextEditorEnabled={richTextEditorEnabled}
          urlPrefix={resLocals.urlPrefix}
          csrfToken={resLocals.__csrf_token}
          questionContainerHtml={questionContainerHtml}
          showJobLogsLink={resLocals.is_administrator}
          variantUrl={variantUrl}
          variantCsrfToken={variantCsrfToken}
        />
      </Hydrate>
    ),
  });
}

export function DraftNotFound({ resLocals }: { resLocals: ResLocalsForPage<'course'> }) {
  return PageLayout({
    resLocals,
    pageTitle: 'Draft question not found',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'questions',
    },
    content: (
      <div className="card mb-4">
        <div className="card-header bg-primary text-white">Draft question not found</div>
        <div className="card-body">
          <p className="mb-0">
            The draft question you're looking for could not be found. It may have been deleted or
            already finalized.
          </p>
        </div>
        <div className="card-footer">
          <a
            href={getAiQuestionGenerationDraftsUrl({ urlPrefix: resLocals.urlPrefix })}
            className="btn btn-primary"
          >
            <i className="fa fa-arrow-left" aria-hidden="true" />
            Back to AI question drafts
          </a>
        </div>
      </div>
    ),
  });
}
