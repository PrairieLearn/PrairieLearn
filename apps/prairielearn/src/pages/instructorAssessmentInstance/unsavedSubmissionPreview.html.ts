import { html, unsafeHtml } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import type { Question } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import type { RenderResultData } from '../../question-servers/types.js';

export function UnsavedSubmissionPreview({
  resLocals,
  question,
  rendered,
  questionJsonBase64,
  urlPrefix,
}: {
  resLocals: ResLocalsForPage<'assessment-instance'>;
  question: Question;
  rendered: RenderResultData;
  questionJsonBase64?: string;
  urlPrefix: string;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Unsaved answer preview' })}
        <meta name="referrer" content="no-referrer" />
        <meta
          name="mathjax-fonts-path"
          content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
        />
        ${compiledScriptTag('question.ts')}
        <script defer src="${nodeModulesAssetPath('mathjax/tex-svg.js')}"></script>
        <script>
          document.urlPrefix = '${urlPrefix}';
        </script>
        ${
          question.type !== 'Freeform'
            ? html`
                <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
                <script src="${assetPath('javascripts/require.js')}"></script>
                <script src="${assetPath('localscripts/question.js')}"></script>
                <script src="${assetPath('localscripts/questionCalculation.js')}"></script>
              `
            : ''
        }
        ${unsafeHtml(rendered.extraHeadersHtml)}
      </head>
      <body class="p-3">
        <main class="question-container">
          ${
            question.workspace_image !== null
              ? html`<p class="alert alert-info">
                  This draft does not include a snapshot of workspace files. Saving it fetches files
                  from the current workspace.
                </p>`
              : ''
          }
          ${
            questionJsonBase64
              ? html`<div hidden class="question-data">${questionJsonBase64}</div>`
              : ''
          }
          <fieldset ${question.type === 'Freeform' ? '' : html`disabled`}>
            <section class="card mb-3" aria-labelledby="question-heading">
              <div class="card-header"><h1 id="question-heading" class="h5">Question</h1></div>
              <div class="card-body question-body">
                <fieldset disabled>${unsafeHtml(rendered.questionHtml)}</fieldset>
              </div>
            </section>
            <section class="card mb-3" aria-labelledby="submission-heading">
              <div class="card-header">
                <h2 id="submission-heading" class="h5">Captured answer</h2>
              </div>
              <div class="card-body submission-body">
                ${unsafeHtml(rendered.submissionHtmls[0] ?? '')}
              </div>
            </section>
            <section class="card mb-3" aria-labelledby="answer-heading">
              <div class="card-header"><h2 id="answer-heading" class="h5">Correct answer</h2></div>
              <div class="card-body answer-body">${unsafeHtml(rendered.answerHtml)}</div>
            </section>
          </fieldset>
        </main>
      </body>
    </html>
  `;
}
