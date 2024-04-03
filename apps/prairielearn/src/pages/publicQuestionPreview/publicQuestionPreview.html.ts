import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { assetPath, nodeModulesAssetPath } from '../../lib/assets';

export function PublicQuestionPreview({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head') %>", {
          ...resLocals,
          pageNote: 'Preview',
          pageTitle: resLocals.question.qid,
        })}
        ${compiledScriptTag('question.ts')}
        <script src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>
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
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container">
          <div class="row">
            <div class="col-lg-9 col-sm-12">
              ${renderEjs(__filename, "<%- include('../partials/question') %>", {
                ...resLocals,
                question_context: 'public',
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
              ${QuestionInfoPanel({ resLocals })}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function QuestionInfoPanel({ resLocals }: { resLocals: Record<string, any> }) {
  const { user, course, question, variant, plainUrlPrefix } = resLocals;

  // Example course questions can be publicly shared, but we don't allow them to
  // be imported into courses, so we won't show the sharing name in the QID.
  //
  // In the future, this should use some kind of "allow import" flag on the question
  // so that this behavior can be achieved within other courses.
  const displayQid = course.example_course
    ? question.qid
    : `@${course.sharing_name}/${question.qid}`;

  return html`
    <div class="card mb-4 border-warning">
      <div class="card-header bg-warning">Staff information</div>
      <div class="card-body">
        <h5 class="card-title">Staff user:</h5>
        <div class="d-flex flex-wrap pb-2">
          <div class="pr-1">${user.name}</div>
          <div class="pr-1">${user.uid}</div>
        </div>

        <hr />
        <h5 class="card-title">Question:</h5>

        <div class="d-flex flex-wrap">
          <div class="pr-1">QID:</div>
          <div>
            <a
              href="${plainUrlPrefix}/public/course/${course.id}/question/${question.id}/preview?variant_seed=${variant.variant_seed}"
            >
              ${displayQid}
            </a>
          </div>
        </div>
        <div class="d-flex flex-wrap">
          <div class="pr-1">Title:</div>
          <div>${question.title}</div>
        </div>
        <div class="d-flex flex-wrap pb-2">
          <div class="pr-1">
            <button
              class="btn btn-link"
              data-toggle="collapse"
              data-target="#instructorTrue_answer"
            >
              Show/Hide answer
            </button>
          </div>
          <div class="collapse" id="instructorTrue_answer">
            <code>${JSON.stringify(variant.true_answer)}</code>
          </div>
        </div>
      </div>
      <div class="card-footer small">This box is not visible to students.</div>
    </div>
  `;
}
