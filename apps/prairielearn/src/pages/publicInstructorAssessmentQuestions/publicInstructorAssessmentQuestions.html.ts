import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { AssessmentBadge } from '../../components/AssessmentBadge.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { TagBadgeList } from '../../components/TagBadge.html.js';
import { TopicBadge } from '../../components/TopicBadge.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  AlternativeGroupSchema,
  AssessmentQuestionSchema,
  AssessmentsFormatForQuestionSchema,
  QuestionSchema,
  TagSchema,
  TopicSchema,
  ZoneSchema,
} from '../../lib/db-types.js';

export const AssessmentQuestionRowSchema = AssessmentQuestionSchema.extend({
  alternative_group_number_choose: AlternativeGroupSchema.shape.number_choose,
  alternative_group_number: AlternativeGroupSchema.shape.number,
  alternative_group_size: z.number(),
  assessment_question_advance_score_perc: AlternativeGroupSchema.shape.advance_score_perc,
  display_name: z.string().nullable(),
  number: z.string().nullable(),
  other_assessments: AssessmentsFormatForQuestionSchema.nullable(),
  sync_errors_ansified: z.string().optional(),
  sync_errors: QuestionSchema.shape.sync_errors,
  sync_warnings_ansified: z.string().optional(),
  sync_warnings: QuestionSchema.shape.sync_warnings,
  topic: TopicSchema,
  qid: QuestionSchema.shape.qid,
  start_new_zone: z.boolean().nullable(),
  start_new_alternative_group: z.boolean().nullable(),
  tags: TagSchema.pick({ color: true, id: true, name: true }).array().nullable(),
  title: QuestionSchema.shape.title,
  zone_best_questions: ZoneSchema.shape.best_questions,
  zone_has_best_questions: z.boolean().nullable(),
  zone_has_max_points: z.boolean().nullable(),
  zone_max_points: ZoneSchema.shape.max_points,
  zone_number_choose: ZoneSchema.shape.number_choose,
  zone_number: ZoneSchema.shape.number,
  zone_title: ZoneSchema.shape.title,
});
type AssessmentQuestionRow = z.infer<typeof AssessmentQuestionRowSchema>;

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
            </div>
            ${AssessmentQuestionsTable({
              questions,
              urlPrefix: resLocals.urlPrefix,
              course_id: resLocals.course.id,
              course_instance_id: resLocals.assessment.course_instance_id,
            })}
          </div>
        </main>
      </body>
    </html>
  `.toString();
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
                    href="/pl/public/course/${course_id}/question/${question.question_id}/preview"
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
                <td>
                  ${question.sync_errors
                    ? html`
                        <button
                          class="btn btn-xs mr-1 js-sync-popover"
                          data-toggle="popover"
                          data-trigger="hover"
                          data-container="body"
                          data-html="true"
                          data-title="Sync Errors"
                          data-content='<pre style="background-color: black" class="text-white rounded p-3 mb-0">${question.sync_errors_ansified}</pre>'
                        >
                          <i class="fa fa-times text-danger" aria-hidden="true"></i>
                        </button>
                      `
                    : question.sync_warnings
                      ? html`
                          <button
                            class="btn btn-xs mr-1 js-sync-popover"
                            data-toggle="popover"
                            data-trigger="hover"
                            data-container="body"
                            data-html="true"
                            data-title="Sync Warnings"
                            data-content='<pre style="background-color: black" class="text-white rounded p-3 mb-0">${question.sync_warnings_ansified}</pre>'
                          >
                            <i
                              class="fa fa-exclamation-triangle text-warning"
                              aria-hidden="true"
                            ></i>
                          </button>
                        `
                      : ''}
                  ${question.display_name}
                </td>
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
