import { html } from '@prairielearn/html';

import { AssessmentBadge } from '../../components/AssessmentBadge.html.js';
import {
  AssessmentQuestionHeaders,
  AssessmentQuestionNumber,
} from '../../components/AssessmentQuestions.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { TagBadgeList } from '../../components/TagBadge.html.js';
import { TopicBadge } from '../../components/TopicBadge.html.js';
import { type Assessment, type Course } from '../../lib/db-types.js';
import { type AssessmentQuestionRow } from '../../models/assessment-question.js';

export function PublicAssessmentQuestions({
  resLocals,
  assessment,
  course,
  course_instance_id,
  questions,
}: {
  resLocals: Record<string, any>;
  assessment: Assessment;
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
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              ${assessment.title} ${assessment.number}: Questions
            </div>
            ${AssessmentQuestionsTable({
              questions,
              urlPrefix: resLocals.urlPrefix,
              course_id: course.id,
              course_instance_id,
              course_sharing_name: course.sharing_name,
            })}
          </div>
        `
      : html`<p>
          This course doesn't have a sharing name. If you are an Owner of this course, please choose
          a sharing name on the
          <a href="${resLocals.plainUrlPrefix}/course/${resLocals.course.id}/course_admin/sharing"
            >course sharing settings page</a
          >.
        </p>`,
  });
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
                <td>${`@${course_sharing_name}/${question.display_name}`}</td>
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
