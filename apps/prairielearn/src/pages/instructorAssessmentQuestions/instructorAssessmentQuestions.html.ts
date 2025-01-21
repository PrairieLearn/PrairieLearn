import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { compiledScriptTag } from '../../lib/assets.js';

import { type AssessmentQuestionRow } from './instructorAssessmentQuestions.types.js';

export function InstructorAssessmentQuestions({
  resLocals,
  questions,
  origHash,
}: {
  resLocals: Record<string, any>;
  questions: AssessmentQuestionRow[];
  origHash: string;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
        ${compiledScriptTag('instructorAssessmentQuestionsClient.tsx')}
      </head>
      <body>
        ${EncodedData(questions, 'assessment-questions-data')} ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${Modal({
            id: 'resetQuestionVariantsModal',
            title: 'Confirm reset question variants',
            body: html`
              <p>
                Are your sure you want to reset all current variants of this question?
                <strong>All ungraded attempts will be lost.</strong>
              </p>
              <p>Students will receive a new variant the next time they view this question.</p>
            `,
            footer: html`
              <input type="hidden" name="__action" value="reset_question_variants" />
              <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
              <input
                type="hidden"
                name="unsafe_assessment_question_id"
                class="js-assessment-question-id"
                value=""
              />
              <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-danger">Reset question variants</button>
            `,
          })}
          <div class="js-edit-modal modal fade"></div>
          ${AssessmentSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            assessment: resLocals.assessment,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          <form method="POST" id="zonesForm">
            <input type="hidden" name="__action" value="edit_assessment_questions" />
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="__orig_hash" value="${origHash}" />
            <input class="js-zones-input" type="hidden" name="zones" value="" />
          </form>
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Questions</h1>
              ${resLocals.authz_data.has_course_instance_permission_edit
                ? html` <div class="js-edit-mode-buttons ml-auto"></div> `
                : ''}
            </div>
            <div
              class="table-responsive js-assessment-questions-table"
              data-assessment-type="${resLocals.assessment.type}"
              data-url-prefix="${resLocals.urlPrefix}"
              data-has-course-permission-preview="${resLocals.authz_data
                .has_course_permission_preview}"
              data-has-course-instance-permission-edit="${resLocals.authz_data
                .has_course_instance_permission_edit}"
            ></div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
