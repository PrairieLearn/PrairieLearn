import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';

import { AssessmentBadgeHtml } from '../../components/AssessmentBadge.js';
import {
  AssessmentQuestionHeaders,
  AssessmentQuestionNumber,
} from '../../components/AssessmentQuestions.js';
import { PageLayout } from '../../components/PageLayout.js';
import { TagBadgeList } from '../../components/TagBadge.js';
import { TopicBadgeHtml } from '../../components/TopicBadge.js';
import type { StaffAssessmentQuestionRow } from '../../lib/assessment-question.shared.js';
import { type Assessment, type AssessmentSet, type Course } from '../../lib/db-types.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

export function PublicAssessmentQuestions({
  resLocals,
  assessment,
  assessment_set,
  course,
  course_instance_id,
  questions,
}: {
  resLocals: UntypedResLocals;
  assessment: Assessment;
  assessment_set: AssessmentSet;
  course: Course;
  course_instance_id: string;
  questions: StaffAssessmentQuestionRow[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Questions',
    navContext: {
      type: 'public',
      page: 'public_assessment',
      subPage: 'questions',
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          ${assessment_set.name} ${assessment.number}: Questions
        </div>
        ${AssessmentQuestionsTable({
          questions,
          course_id: course.id,
          course_instance_id,
          course,
        })}
      </div>
    `,
  });
}

function AssessmentQuestionsTable({
  questions,
  course_id,
  course_instance_id,
  course,
}: {
  questions: StaffAssessmentQuestionRow[];
  course_id: string;
  course_instance_id: string;
  course: Course;
}) {
  const nTableCols = 5;
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
              ${renderHtml(
                <AssessmentQuestionHeaders question={question} nTableCols={nTableCols} />,
              )}
              <tr>
                <td>
                  <a href="/pl/public/course/${course_id}/question/${question.question.id}/preview">
                    ${renderHtml(
                      <AssessmentQuestionNumber
                        alternativeGroupSize={question.alternative_group_size}
                        alternativeGroupNumber={question.alternative_group.number}
                        numberInAlternativeGroup={
                          question.assessment_question.number_in_alternative_group
                        }
                      />,
                    )}${question.question.title}
                  </a>
                </td>
                <td>@${course.sharing_name}/${question.question.qid}</td>
                <td>${TopicBadgeHtml(question.topic)}</td>
                <td>${renderHtml(<TagBadgeList tags={question.tags} />)}</td>
                <td>
                  ${question.other_assessments
                    ? question.other_assessments.map((assessment) => {
                        return AssessmentBadgeHtml({
                          assessment: {
                            assessment_id: assessment.assessment_id,
                            color: assessment.assessment_set_color,
                            label: `${assessment.assessment_set_abbreviation}${assessment.assessment_number}`,
                          },
                          courseInstanceId: course_instance_id,
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
