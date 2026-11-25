import { html, unsafeHtml } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import type { Question, UnsavedSubmission } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import type { RenderResultData } from '../../question-servers/types.js';

export function UnsavedSubmissionPreview({
  resLocals,
  question,
  preview,
}: {
  resLocals: ResLocalsForPage<'assessment-instance'>;
  question: Question;
  preview:
    | { rendered: RenderResultData; questionJsonBase64?: string; urlPrefix: string }
    | { rawSubmittedAnswer: UnsavedSubmission['raw_submitted_answer'] };
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Unsaved answer preview' })}
        <meta name="referrer" content="no-referrer" />
        ${
          'rendered' in preview
            ? html`
                <meta
                  name="mathjax-fonts-path"
                  content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
                />
                ${compiledScriptTag('question.ts')}
                <script defer src="${nodeModulesAssetPath('mathjax/tex-svg.js')}"></script>
                <script>
                  document.urlPrefix = '${preview.urlPrefix}';
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
                ${unsafeHtml(preview.rendered.extraHeadersHtml)}
              `
            : ''
        }
      </head>
      <body class="p-3">
        <main class="question-container">
          ${
            'rawSubmittedAnswer' in preview
              ? html`
                  <section class="card" aria-labelledby="submission-heading">
                    <div class="card-header">
                      <h1 id="submission-heading" class="h5">Captured answer</h1>
                    </div>
                    <div class="card-body">
                      <p>Raw captured data for the reset or invalidated question variant:</p>
                      <pre
                        class="mb-0"
                      ><code>${JSON.stringify(preview.rawSubmittedAnswer, null, 2)}</code></pre>
                    </div>
                  </section>
                `
              : html`
                  ${
                    question.workspace_image !== null
                      ? html`<p class="alert alert-info">
                          This draft does not include a snapshot of workspace files. Saving it
                          fetches files from the current workspace.
                        </p>`
                      : ''
                  }
                  ${
                    preview.questionJsonBase64
                      ? html`<div hidden class="question-data">${preview.questionJsonBase64}</div>`
                      : ''
                  }
                  <fieldset ${question.type === 'Freeform' ? '' : html`disabled`}>
                    <legend class="visually-hidden">Unsaved work preview</legend>
                    <section class="card mb-3" aria-labelledby="question-heading">
                      <div class="card-header">
                        <h1 id="question-heading" class="h5">Question</h1>
                      </div>
                      <div class="card-body question-body">
                        <fieldset disabled>
                          <legend class="visually-hidden">Question inputs</legend>
                          ${unsafeHtml(preview.rendered.questionHtml)}
                        </fieldset>
                      </div>
                    </section>
                    <section class="card mb-3" aria-labelledby="submission-heading">
                      <div class="card-header">
                        <h2 id="submission-heading" class="h5">Captured answer</h2>
                      </div>
                      <div class="card-body submission-body">
                        ${unsafeHtml(preview.rendered.submissionHtmls[0] ?? '')}
                      </div>
                    </section>
                    <section class="card mb-3" aria-labelledby="answer-heading">
                      <div class="card-header">
                        <h2 id="answer-heading" class="h5">Correct answer</h2>
                      </div>
                      <div class="card-body answer-body">
                        ${unsafeHtml(preview.rendered.answerHtml)}
                      </div>
                    </section>
                  </fieldset>
                `
          }
        </main>
      </body>
    </html>
  `;
}
