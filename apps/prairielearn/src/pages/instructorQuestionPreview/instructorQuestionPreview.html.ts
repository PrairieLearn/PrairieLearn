import { html, unsafeHtml } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { QuestionContainer } from '../../components/QuestionContainer.html.js';
import { QuestionSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';

export function InstructorQuestionPreview({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({
          resLocals,
          pageTitle: 'Question Preview',
          pageNote: resLocals.question.qid,
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
        ${Navbar({ resLocals })}
        <div class="container-fluid">
          ${QuestionSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            question: resLocals.question,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
        </div>
        <main id="content" class="container">
          <div class="row">
            <div class="col-lg-9 col-sm-12">
              ${QuestionContainer({ resLocals, questionContext: 'instructor' })}
            </div>

            <div class="col-lg-3 col-sm-12">
              <div class="card mb-4">
                <div class="card-header bg-secondary text-white">
                  <h2>Student view placeholder</h2>
                </div>
                <div class="card-body">
                  <div class="d-flex justify-content-center">
                    In student views this area is used for assessment and score info.
                  </div>
                </div>
              </div>
              ${InstructorInfoPanel({
                course: resLocals.course,
                course_instance: resLocals.course_instance,
                question: resLocals.question,
                variant: resLocals.variant,
                authz_data: resLocals.authz_data,
                question_is_shared: resLocals.question_is_shared,
                questionContext: 'instructor',
                csrfToken: resLocals.__csrf_token,
              })}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
