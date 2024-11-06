import { html } from '@prairielearn/html';

import { AssessmentBadge } from '../../components/AssessmentBadge.html.js';
import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { TagBadgeList } from '../../components/TagBadge.html.js';
import { TopicBadge } from '../../components/TopicBadge.html.js';
import { type AssessmentQuestionRow } from '../../models/questions.js';


function CopyAssessmentModal({ resLocals }: { resLocals: Record<string, any> }) {
  const { assessment_copy_targets, assessment, course_instance } = resLocals;
  if (assessment_copy_targets == null) return '';
  return Modal({
    id: 'copyAssessmentModal',
    title: 'Copy assessment',
    formAction: assessment_copy_targets[0]?.copy_url ?? '',
    body:
      assessment_copy_targets.length === 0
        ? html`
            <p>
              You can't copy this assessment because you don't have editor permissions in any courses that have course instances.
              <a href="/pl/request_course">Request a course</a> if you don't have one already.
              Otherwise, contact the owner of the course you expected to have access to.
            </p>
          `
        : html`
            <p>
              This assessment can be copied to any course instance in courses for which you have editor permissions.
              Select one of your course instances to copy this assessment to.
            </p>
            <select class="custom-select" name="to_course_instance_id" required>
              ${assessment_copy_targets.map(
                (course_instance, index) => html`
                  <option
                    value="${course_instance.id}"
                    data-csrf-token="${course_instance.__csrf_token}"
                    data-copy-url="${course_instance.copy_url}"
                    ${index === 0 ? 'selected' : ''}
                  >
                    ${course_instance.short_name}
                  </option>
                `,
              )}
            </select>
          `,
    footer: html`
      <input
        type="hidden"
        name="__csrf_token"
        value="${assessment_copy_targets[0]?.__csrf_token ?? ''}"
      />
      <input type="hidden" name="assessment_id" value="${assessment.id}" />
      <input type="hidden" name="course_instance_id" value="${course_instance.id}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      ${assessment_copy_targets?.length > 0
        ? html`
            <button type="submit" name="__action" value="copy_assessment" class="btn btn-primary">
              Copy assessment
            </button>
          `
        : ''}
    `,
  });
}



export function InstructorAssessmentQuestions({
  resLocals,
  questions,
}: {
  resLocals: Record<string, any>;
  questions: AssessmentQuestionRow[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              ${resLocals.assessment.title} ${resLocals.assessment.number}: Questions
              <button
                class="btn btn-light btn-sm ml-auto"
                type="button"
                data-toggle="modal"
                data-target="#copyAssessmentModal"
              >
                <i class="fa fa-clone"></i>
                Copy assessment
              </button>
            </div>
            ${AssessmentQuestionsTable({
              questions,
              urlPrefix: resLocals.urlPrefix,
              course_id: resLocals.course.id,
              course_instance_id: resLocals.assessment.course_instance_id,
              course_sharing_name: resLocals.course.sharing_name,
            })}
          </div>
        </main>
      </body>
    </html>
  ${CopyAssessmentModal({ resLocals })}
  `.toString();
}
function AssessmentQuestionsTable({
  questions,
  urlPrefix,
  course_id,
  course_instance_id,
  course_sharing_name,
}: {
  questions: AssessmentQuestionRow[];
  urlPrefix: string;
  course_id: string;
  course_instance_id: string;
  course_sharing_name: string;
}) {
  const nTableCols = 4;

  return html`
    <div class="table-responsive">
      <table class="table table-sm table-hover">
        <thead>
          <tr>
            <th><span class="sr-only">Name</span></th>
            <th>QID</th>
            <th>Topic</th>
            <th>Tags</th>
            <th>Other Assessments</th>
          </tr>
        </thead>
        <tbody>
          ${questions.map((question) => {
            return html`
              ${question.start_new_zone
                ? html`
                    <tr>
                      <th colspan="${nTableCols}">
                        Zone ${question.zone_number}. ${question.zone_title}
                        ${question.zone_number_choose == null
                          ? '(Choose all questions)'
                          : question.zone_number_choose === 1
                            ? '(Choose 1 question)'
                            : `(Choose ${question.zone_number_choose} questions)`}
                        ${question.zone_has_max_points
                          ? `(maximum ${question.zone_max_points} points)`
                          : ''}
                        ${question.zone_has_best_questions
                          ? `(best ${question.zone_best_questions} questions)`
                          : ''}
                      </th>
                    </tr>
                  `
                : ''}
              ${question.start_new_alternative_group && question.alternative_group_size > 1
                ? html`
                    <tr>
                      <td colspan="${nTableCols}">
                        ${question.alternative_group_number}.
                        ${question.alternative_group_number_choose == null
                          ? 'Choose all questions from:'
                          : question.alternative_group_number_choose === 1
                            ? 'Choose 1 question from:'
                            : `Choose ${question.alternative_group_number_choose} questions from:`}
                      </td>
                    </tr>
                  `
                : ''}
              <tr>
                <td>
                  <a
                    href="${urlPrefix}/public/course/${course_id}/question/${question.question_id}/preview"
                  >
                    ${question.alternative_group_size === 1
                      ? `${question.alternative_group_number}.`
                      : html`
                          <span class="ml-3">
                            ${question.alternative_group_number}.${question.number_in_alternative_group}.
                          </span>
                        `}
                    ${question.title}
                  </a>
                </td>
                <td>${`@${course_sharing_name}/${question.display_name}`}</td>
                <td>${TopicBadge(question.topic)}</td>
                <td>${TagBadgeList(question.tags)}</td>
                <td>
                  ${question.other_assessments
                    ? question.other_assessments.map((assessment) => {
                        return html`${AssessmentBadge({
                          assessment,
                          plainUrlPrefix: urlPrefix,
                          course_instance_id,
                          publicURL: true,
                        })}`;
                      })
                    : ''}
                </td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    </div>
  `;
}
