import { html } from '@prairielearn/html';

import { AssessmentBadge } from '../../components/AssessmentBadge.html.js';
import {
  AssessmentQuestionHeaders,
  AssessmentQuestionNumber,
} from '../../components/AssessmentQuestions.html.js';
import { Modal } from '../../components/Modal.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { TagBadgeList } from '../../components/TagBadge.html.js';
import { TopicBadge } from '../../components/TopicBadge.html.js';
import { type Assessment, type AssessmentSet, type Course } from '../../lib/db-types.js';
import { type AssessmentQuestionRow } from '../../models/assessment-question.js';

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
              You can't copy this assessment because you don't have editor permissions in any
              courses that have course instances.
              <a href="/pl/request_course">Request a course</a> if you don't have one already.
              Otherwise, contact the owner of the course you expected to have access to.
            </p>
          `
        : html`
            <p>
              This assessment can be copied to any course instance in courses for which you have
              editor permissions. Select one of your course instances to copy this assessment to.
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

export function PublicAssessmentQuestions({
  resLocals,
  assessment,
  assessment_set,
  course,
  course_instance_id,
  questions,
}: {
  resLocals: Record<string, any>;
  assessment: Assessment;
  assessment_set: AssessmentSet;
  course: Course;
  course_instance_id: string;
  questions: AssessmentQuestionRow[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Questions',
    navContext: {
      type: 'public',
      page: 'public_assessment',
      subPage: 'questions',
    },
    content: course.sharing_name
      ? html`
          ${CopyAssessmentModal({ resLocals })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              ${assessment_set.name} ${assessment.number}: Questions
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
              course_id: course.id,
              course_instance_id,
            })}
          </div>
        `
      : html`
          <p>
            This course doesn't have a sharing name. If you are an Owner of this course, please
            choose a sharing name on the
            <a href="${resLocals.plainUrlPrefix}/course/${resLocals.course.id}/course_admin/sharing"
              >course sharing settings page</a
            >.
          </p>
        `,
  });
}

function AssessmentQuestionsTable({
  questions,
  urlPrefix,
  course_id,
  course_instance_id,
}: {
  questions: AssessmentQuestionRow[];
  urlPrefix: string;
  course_id: string;
  course_instance_id: string;
}) {
  const nTableCols = 4;
  return html`
    <div class="table-responsive">
      <table class="table table-sm table-hover">
        <thead>
          <tr>
            <th><span class="visually-hidden">Name</span></th>
            <th>QID</th>
            <th>Topic</th>
            <th>Tags</th>
            <th>Other Assessments</th>
          </tr>
        </thead>
        <tbody>
          ${questions.map((question) => {
            return html`
              ${AssessmentQuestionHeaders(question, nTableCols)}
              <tr>
                <td>
                  <a
                    href="${urlPrefix}/public/course/${course_id}/question/${question.question_id}/preview"
                  >
                    ${AssessmentQuestionNumber(question)}${question.title}
                  </a>
                </td>
                <td>@${question.course_sharing_name}/${question.qid}</td>
                <td>${TopicBadge(question.topic)}</td>
                <td>${TagBadgeList(question.tags)}</td>
                <td>
                  ${question.other_assessments
                    ? question.other_assessments.map((assessment) => {
                        return AssessmentBadge({
                          assessment,
                          plainUrlPrefix: urlPrefix,
                          course_instance_id,
                          publicURL: true,
                        });
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
