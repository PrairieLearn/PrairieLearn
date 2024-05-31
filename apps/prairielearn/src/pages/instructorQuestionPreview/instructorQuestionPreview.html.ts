import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';

export function InstructorQuestionPreview({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head') %>", {
          ...resLocals,
          pageNote: 'Preview',
          pageTitle: resLocals.question.qid,
        })}
        ${compiledScriptTag('question.ts')}
        <script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>
        <script>
          document.urlPrefix = '${resLocals.urlPrefix}';
        </script>
        ${resLocals.question.type !== 'Freeform'
          ? html`
              <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
              <script src="${assetPath('javascripts/require.js')}"></script>
              <script src="${assetPath('localscripts/question.js')}"></script>
              <script src="${assetPath(
                  `localscripts/question${resLocals.effectiveQuestionType}.js`,
                )}"></script>
            `
          : ''}
        ${unsafeHtml(resLocals.extraHeadersHtml)}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <div class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/questionSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
        </div>
        <main id="content" class="container">
          <div class="row">
            <div class="col-lg-9 col-sm-12">
              ${renderEjs(import.meta.url, "<%- include('../partials/question'); %>", {
                ...resLocals,
                question_context: 'instructor',
              })}
            </div>

            <div class="col-lg-3 col-sm-12">
              <div class="card mb-4">
                <div class="card-header bg-secondary text-white">Student view placeholder</div>
                <div class="card-body">
                  <div class="d-flex justify-content-center">
                    In student views this area is used for assessment and score info.
                  </div>
                </div>
              </div>
              ${renderEjs(import.meta.url, "<%- include('../partials/instructorInfoPanel'); %>", {
                ...resLocals,
                question_context: 'instructor',
              })}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
