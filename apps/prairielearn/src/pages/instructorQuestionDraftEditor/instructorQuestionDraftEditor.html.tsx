import { html, unsafeHtml } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../lib/assets.js';
import { StaffQuestionSchema } from '../../lib/client/safe-db-types.js';
import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { type Question } from '../../lib/db-types.js';
import type { ResLocalsQuestionRender } from '../../lib/question-render.types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { generateCsrfToken } from '../../middlewares/csrfToken.js';

import {
  DraftQuestionEditor,
  type SelectedQuestionFile,
} from './components/DraftQuestionEditor.js';

export function InstructorQuestionDraftEditor({
  resLocals,
  question,
  questionFiles,
  allQuestionFiles,
  selectedFile,
  richTextEditorEnabled,
  questionContainerHtml,
  editorUrl,
  search,
}: {
  resLocals: ResLocalsForPage<'instructor-question'> & ResLocalsQuestionRender;
  question: Question;
  questionFiles: Record<string, string>;
  allQuestionFiles: { path: string; size: number }[];
  selectedFile: SelectedQuestionFile | null;
  richTextEditorEnabled: boolean;
  questionContainerHtml: string;
  editorUrl: string;
  search: string;
}) {
  const variantUrl = `${resLocals.urlPrefix}/question/${question.id}/draft/variant`;
  const filesUrlBase = `${resLocals.urlPrefix}/question/${question.id}/draft/files`;
  const filesUrl =
    selectedFile == null
      ? filesUrlBase
      : `${filesUrlBase}?file=${encodeURIComponent(selectedFile.path)}`;
  const variantCsrfToken = generateCsrfToken({
    url: variantUrl,
    authnUserId: resLocals.authn_user.id,
  });
  const trpcUrl = getCourseTrpcUrl(resLocals.course.id);
  const trpcCsrfToken = generatePrefixCsrfToken(
    { url: trpcUrl, authn_user_id: resLocals.authn_user.id },
    config.secretKey,
  );

  return PageLayout({
    resLocals,
    pageTitle: 'Draft question editor',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
    },
    options: {
      fullWidth: true,
      fullHeight: true,
      contentPadding: false,
      forcedInitialNavToggleState: false,
    },
    headContent: [
      html`<meta
        name="mathjax-fonts-path"
        content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
      />`,
      compiledScriptTag('question.ts'),
      compiledStylesheetTag('instructorQuestionDraftEditor.css'),
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
        <DraftQuestionEditor
          question={StaffQuestionSchema.parse(question)}
          questionFiles={questionFiles}
          allQuestionFiles={allQuestionFiles}
          selectedFile={selectedFile}
          richTextEditorEnabled={richTextEditorEnabled}
          urlPrefix={resLocals.urlPrefix}
          editorUrl={editorUrl}
          filesUrl={filesUrl}
          csrfToken={resLocals.__csrf_token}
          questionContainerHtml={questionContainerHtml}
          variantUrl={variantUrl}
          variantCsrfToken={variantCsrfToken}
          trpcCsrfToken={trpcCsrfToken}
          courseId={resLocals.course.id}
          editErrorUrlPrefix={`${resLocals.urlPrefix}/edit_error`}
          search={search}
        />
      </Hydrate>
    ),
  });
}
