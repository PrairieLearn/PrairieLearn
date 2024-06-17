import { EncodedData } from '@prairielearn/browser-utils';
import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { AssessmentScorePanel } from '../../components/AssessmentScorePanel.html.js';
import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.html.js';
import { QuestionContainer, QuestionTitle } from '../../components/QuestionContainer.html.js';
import { QuestionScorePanel } from '../../components/QuestionScore.html.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import { config } from '../../lib/config.js';

export function StudentInstanceQuestion({ resLocals }: { resLocals: Record<string, any> }) {
  const questionContext =
    resLocals.assessment.type === 'Exam' ? 'student_exam' : 'student_homework';

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        ${compiledScriptTag('question.ts')}
        ${resLocals.assessment.type === 'Exam'
          ? html`
              ${compiledScriptTag('examTimeLimitCountdown.ts')}
              ${EncodedData(
                {
                  serverRemainingMS: resLocals.assessment_instance_remaining_ms,
                  serverTimeLimitMS: resLocals.assessment_instance_time_limit_ms,
                  serverUpdateURL: `${resLocals.urlPrefix}/assessment_instance/${resLocals.assessment_instance.id}/time_remaining`,
                  canTriggerFinish: resLocals.authz_result.authorized_edit,
                  csrfToken: resLocals.__csrf_token,
                },
                'time-limit-data',
              )}
            `
          : ''}
        <script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>
        <script>
          document.urlPrefix = '${resLocals.urlPrefix}';
        </script>
        ${resLocals.variant == null
          ? ''
          : html`
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
            `}
        ${compiledScriptTag('studentInstanceQuestionClient.ts')}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: '',
        })}
        <main id="content" class="container">
          <div class="row">
            <div class="col-lg-9 col-sm-12">
              ${resLocals.variant == null
                ? html`
                    <div class="card mb-4">
                      <div class="card-header bg-primary text-white">
                        ${QuestionTitle({
                          questionContext,
                          question: resLocals.question,
                          questionNumber: resLocals.instance_question_info.question_number,
                        })}
                      </div>
                      <div class="card-body">
                        This question was not viewed while the assessment was open, so no variant
                        was created.
                      </div>
                    </div>
                  `
                : QuestionContainer({ resLocals, questionContext })}
            </div>

            <div class="col-lg-3 col-sm-12">
              ${resLocals.assessment.type === 'Exam'
                ? html`
                    <div class="card mb-4">
                      <div class="card-header bg-secondary">
                        <a
                          class="text-white"
                          href="${resLocals.urlPrefix}/assessment_instance/${resLocals
                            .assessment_instance.id}/"
                        >
                          ${resLocals.assessment_set.name} ${resLocals.assessment.number}
                        </a>
                      </div>

                      <div class="card-body">
                        <div class="d-flex justify-content-center">
                          <a
                            class="btn btn-info"
                            href="${resLocals.urlPrefix}/assessment_instance/${resLocals
                              .assessment_instance.id}/"
                          >
                            Assessment overview
                          </a>
                        </div>

                        ${resLocals.assessment_instance.open &&
                        resLocals.assessment_instance_remaining_ms != null
                          ? html`
                              <div class="mt-3">
                                <div id="countdownProgress"></div>
                                <p class="mb-0">
                                  Time remaining: <span id="countdownDisplay"></span>
                                </p>
                              </div>
                            `
                          : ''}
                      </div>
                    </div>
                  `
                : AssessmentScorePanel({
                    urlPrefix: resLocals.urlPrefix,
                    assessment: resLocals.assessment,
                    assessment_set: resLocals.assessment_set,
                    assessment_instance: resLocals.assessment_instance,
                  })}
              ${QuestionScorePanel({
                instance_question: resLocals.instance_question,
                assessment: resLocals.assessment,
                assessment_question: resLocals.assessment_question,
                question: resLocals.question,
                assessment_instance: resLocals.assessment_instance,
                instance_question_info: resLocals.instance_question_info,
                variant: resLocals.variant,
                authz_result: resLocals.authz_result,
                csrfToken: resLocals.__csrf_token,
                urlPrefix: resLocals.urlPrefix,
              })}
              ${renderEjs(
                import.meta.url,
                "<%- include('../partials/questionNavSideButtonGroup') %>",
                resLocals,
              )}
              ${config.attachedFilesDialogEnabled
                ? renderEjs(
                    import.meta.url,
                    "<%- include('../partials/attachFilePanel') %>",
                    resLocals,
                  )
                : ''}
              ${InstructorInfoPanel({
                course: resLocals.course,
                course_instance: resLocals.course_instance,
                assessment: resLocals.assessment,
                assessment_instance: resLocals.assessment_instance,
                instance_question: resLocals.instance_question,
                question: resLocals.question,
                variant: resLocals.variant,
                user: resLocals.user,
                instance_group: resLocals.instance_group,
                instance_group_uid_list: resLocals.instance_group_uid_list,
                instance_user: resLocals.instance_user,
                authz_data: resLocals.authz_data,
                question_is_shared: resLocals.question_is_shared,
                questionContext:
                  resLocals.assessment.type === 'Exam' ? 'student_exam' : 'student_homework',
                csrfToken: resLocals.__csrf_token,
              })}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
