import _ from 'lodash';
import { z } from 'zod';

import { html, unsafeHtml } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { ScorebarHtml } from '../../components/Scorebar.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  AlternativeGroupSchema,
  AssessmentQuestionSchema,
  CourseInstanceSchema,
  CourseSchema,
  IdSchema,
  QuestionSchema,
  TagSchema,
  TopicSchema,
  ZoneSchema,
} from '../../lib/db-types.js';
import { formatFloat } from '../../lib/format.js';
import { STAT_DESCRIPTIONS } from '../shared/assessmentStatDescriptions.js';

export const AssessmentQuestionStatsRowSchema = AssessmentQuestionSchema.extend({
  course_short_name: CourseSchema.shape.short_name,
  course_instance_short_name: CourseInstanceSchema.shape.short_name,
  assessment_label: z.string(),
  qid: QuestionSchema.shape.qid,
  question_title: QuestionSchema.shape.title,
  topic: TopicSchema,
  question_tags: z.array(TagSchema.shape.name),
  question_id: IdSchema,
  assessment_question_number: z.string(),
  alternative_group_number: AlternativeGroupSchema.shape.number,
  alternative_group_size: z.number(),
  zone_title: ZoneSchema.shape.title,
  start_new_zone: z.boolean(),
  start_new_alternative_group: z.boolean(),
});
export type AssessmentQuestionStatsRow = z.infer<typeof AssessmentQuestionStatsRowSchema>;

export function InstructorAssessmentQuestionStatistics({
  questionStatsCsvFilename,
  statsLastUpdated,
  rows,
  resLocals,
}: {
  questionStatsCsvFilename: string;
  statsLastUpdated: string;
  rows: AssessmentQuestionStatsRow[];
  resLocals: Record<string, any>;
}) {
  const histminiOptions = { width: 60, height: 20, ymax: 1 };

  return PageLayout({
    resLocals,
    pageTitle: 'Question Statistics',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'question_statistics',
    },
    options: {
      fullWidth: true,
    },
    headContent: compiledScriptTag('instructorAssessmentQuestionStatisticsClient.ts'),
    content: html`
      <h1 class="visually-hidden">
        ${resLocals.assessment_set.name} ${resLocals.assessment.number} Question Statistics
      </h1>
      ${renderHtml(
        <AssessmentSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          assessment={resLocals.assessment}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      ${resLocals.authz_data.has_course_permission_edit
        ? Modal({
            title: 'Refresh statistics',
            id: 'refreshAssessmentQuestionStatsModal',
            body: html`
              Are you sure you want to refresh all statistics for
              <strong>${resLocals.assessment_set.name} ${resLocals.assessment.number}</strong>? This
              cannot be undone.
            `,
            footer: html`
              <input type="hidden" name="__action" value="refresh_stats" />
              <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                Cancel
              </button>
              <button type="submit" class="btn btn-danger">Submit</button>
            `,
          })
        : ''}

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center gap-2">
          <h2>
            ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Question difficulty vs
            discrimination
          </h2>
          <div class="ms-auto">
            <small>
              <span class="text-light me-2">Last calculated: ${statsLastUpdated}</span>
            </small>
            <button
              type="button"
              class="btn btn-sm btn-light"
              data-bs-toggle="modal"
              data-bs-target="#refreshAssessmentQuestionStatsModal"
            >
              <i class="fa fa-sync" aria-hidden="true"></i> Recalculate statistics
            </button>
          </div>
        </div>

        ${resLocals.assessment.score_stat_number > 0
          ? html`
              <div class="card-body">
                <div
                  id="difficultyDiscriminationScatter"
                  class="js-scatter"
                  data-xdata="${JSON.stringify(rows.map((q) => q.mean_question_score))}"
                  data-ydata="${JSON.stringify(rows.map((q) => q.discrimination))}"
                  data-options="${JSON.stringify({
                    xgrid: _.range(0, 110, 10),
                    ygrid: _.range(0, 110, 10),
                    xlabel: 'mean score / %',
                    ylabel: 'discrimination / %',
                    radius: 2,
                    topMargin: 30,
                    labels: rows.map((q) => q.assessment_question_number),
                  })}"
                ></div>
              </div>
              <div class="card-footer small">
                <ul>
                  <li>
                    <strong>Mean score</strong> of a question is the average score for all students
                    on the question. It is best to have a range of questions with different mean
                    scores on the test, with some easy (mean score above 90%) and some hard (mean
                    score below 50%).
                  </li>
                  <li>
                    <strong>Discrimination</strong> of a question is the correlation coefficient
                    between the scores on the question and the total assessment scores.
                    Discrimination values should be above 20%, unless a question is very easy (mean
                    score above 95%), in which case it is acceptable to have lower discriminations.
                    It is always better to have higher discriminations for all questions, and a
                    range of discriminations is not desired.
                  </li>
                </ul>
              </div>
            `
          : html`<div class="card-body">No student data.</div>`}
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h2>
            ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Question statistics
          </h2>
          <div class="ms-auto">
            <small>
              <span class="text-light me-2">Last calculated: ${statsLastUpdated}</span>
            </small>
            <button
              type="button"
              class="btn btn-sm btn-light"
              data-bs-toggle="modal"
              data-bs-target="#refreshAssessmentQuestionStatsModal"
            >
              <i class="fa fa-sync" aria-hidden="true"></i> Recalculate statistics
            </button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm table-hover tablesorter" aria-label="Question statistics">
            <thead>
              <tr>
                <th class="text-center">Question</th>
                <th class="text-center">Mean score</th>
                <th class="text-center">Discrimination</th>
                <th class="text-center">Auto-graded Attempts</th>
                <th class="text-center">Quintiles</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(
                (row) => html`
                  <tr>
                    <td>
                      <a href="${resLocals.urlPrefix}/question/${row.question_id}/">
                        ${row.assessment_question_number}. ${row.question_title}
                      </a>
                    </td>
                    <td class="text-center align-middle">
                      ${ScorebarHtml(
                        row.mean_question_score ? Math.round(row.mean_question_score) : null,
                      )}
                    </td>
                    <td class="text-center align-middle">
                      ${ScorebarHtml(row.discrimination ? Math.round(row.discrimination) : null)}
                    </td>
                    <td class="text-center">
                      ${(row.max_auto_points ?? 0) > 0 ||
                      row.max_manual_points === 0 ||
                      (row.average_number_submissions ?? 0) > 0
                        ? formatFloat(row.average_number_submissions)
                        : html`&mdash;`}
                    </td>
                    ${(row.number ?? 0) > 0
                      ? html`
                          <td class="text-center">
                            <div
                              class="js-histmini"
                              data-data="${JSON.stringify(row.quintile_question_scores)}"
                              data-options="${JSON.stringify({
                                ...histminiOptions,
                                ymax: 100,
                              })}"
                            ></div>
                          </td>
                        `
                      : html`<td class="text-center"></td>`}
                    <td class="align-middle text-nowrap" style="width: 1em;">
                      ${resLocals.authz_data.has_course_instance_permission_edit
                        ? html`
                            <a
                              class="btn btn-xs btn-primary"
                              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                .id}/manual_grading/assessment_question/${row.id}"
                            >
                              Manual grading
                            </a>
                          `
                        : ''}
                    </td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
        <div class="card-footer">
          <p>
            Download
            <a
              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                .id}/question_statistics/${questionStatsCsvFilename}"
            >
              ${questionStatsCsvFilename}
            </a>
          </p>
          <div class="small">
            <ul>
              <li>
                <strong>Mean score</strong> of a question is the average score for all students on
                the question. It is best to have a range of questions with different mean scores on
                the test, with some easy (mean score above 90%) and some hard (mean score below
                50%).
              </li>
              <li>
                <strong>Discrimination</strong> of a question is the correlation coefficient between
                the scores on the question and the total assessment scores. Discrimination values
                should be above 20%, unless a question is very easy (mean score above 95%), in which
                case it is acceptable to have lower discriminations. It is always better to have
                higher discriminations for all questions, and a range of discriminations is not
                desired.
              </li>
              <li>
                <strong>Auto-graded Attempts</strong> for a question is the average number of
                auto-graded attempts made per student at the question.
              </li>
              <li>
                <strong>Quintiles</strong> shows the average scores on the question for students in
                the lowest 20% of the class, the next 20%, etc, where the quintiles are determined
                by total assessment score. Good questions should have very low scores for the lowest
                quintile (the left-most), and very high scores for the highest quintile (the
                right-most). This is essentially a graphical representation of the discrimination.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center gap-2">
          <h2>
            ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Detailed question
            statistics
          </h2>
          <div class="ms-auto">
            <small>
              <span class="text-light me-2">Last calculated: ${statsLastUpdated}</span>
            </small>
            <button
              type="button"
              class="btn btn-sm btn-light"
              data-bs-toggle="modal"
              data-bs-target="#refreshAssessmentQuestionStatsModal"
            >
              <i class="fa fa-sync" aria-hidden="true"></i> Recalculate statistics
            </button>
          </div>
        </div>

        <div class="table-responsive">
          <table
            class="table table-sm table-hover tablesorter table-bordered"
            aria-label="Detailed question statistics"
          >
            <thead>
              <tr>
                <th class="text-center">Question</th>
                ${Object.keys(STAT_DESCRIPTIONS).map((stat) => {
                  if (
                    stat !== 'INCREMENTAL_SUBMISSION_SCORE_POINTS_AVERAGES' ||
                    resLocals.assessment.type !== 'Homework'
                  ) {
                    // We use `unsafeHtml` for the description below because some
                    // contain raw HTML. This is safe, as none of this is user-controlled.
                    return html`
                      <th class="text-center" title="${STAT_DESCRIPTIONS[stat].description}">
                        ${unsafeHtml(STAT_DESCRIPTIONS[stat].title)}
                      </th>
                    `;
                  }
                })}
              </tr>
            </thead>
            <tbody>
              ${rows.map(function (row) {
                return html`
                  <tr>
                    <td style="white-space: nowrap;">
                      <a href="${resLocals.urlPrefix}/question/${row.question_id}/">
                        ${row.assessment_question_number}. ${row.qid}
                      </a>
                    </td>
                    <td class="text-center">${formatFloat(row.mean_question_score, 1)}</td>
                    <td class="text-center">${formatFloat(row.median_question_score, 1)}</td>
                    <td class="text-center">${formatFloat(row.question_score_variance, 1)}</td>
                    <td class="text-center">${formatFloat(row.discrimination, 1)}</td>
                    ${(row.max_auto_points ?? 0) > 0 || row.max_manual_points === 0
                      ? html`
                          <td class="text-center">${formatFloat(row.some_submission_perc, 1)}</td>
                          <td class="text-center">
                            ${formatFloat(row.some_perfect_submission_perc, 1)}
                          </td>
                          <td class="text-center">
                            ${formatFloat(row.some_nonzero_submission_perc, 1)}
                          </td>
                          <td class="text-center">
                            ${formatFloat(row.average_first_submission_score, 2)}
                          </td>
                          <td class="text-center">
                            ${formatFloat(row.first_submission_score_variance, 2)}
                          </td>
                          <td class="text-center">
                            ${row.first_submission_score_hist !== null
                              ? html`
                                  <div
                                    class="js-histmini"
                                    data-data="${JSON.stringify(row.first_submission_score_hist)}"
                                    data-options="${JSON.stringify({
                                      ...histminiOptions,
                                      normalize: true,
                                    })}"
                                  ></div>
                                `
                              : ''}
                          </td>
                          <td class="text-center">
                            ${formatFloat(row.average_last_submission_score, 2)}
                          </td>
                          <td class="text-center">
                            ${formatFloat(row.last_submission_score_variance, 2)}
                          </td>
                          <td class="text-center">
                            ${row.last_submission_score_hist !== null
                              ? html`
                                  <div
                                    class="js-histmini"
                                    data-data="${JSON.stringify(row.last_submission_score_hist)}"
                                    data-options="${JSON.stringify({
                                      ...histminiOptions,
                                      normalize: true,
                                    })}"
                                  ></div>
                                `
                              : ''}
                          </td>
                          <td class="text-center">
                            ${formatFloat(row.average_max_submission_score, 2)}
                          </td>
                          <td class="text-center">
                            ${formatFloat(row.max_submission_score_variance, 2)}
                          </td>
                          <td class="text-center">
                            ${row.max_submission_score_hist !== null
                              ? html`
                                  <div
                                    class="js-histmini"
                                    data-data="${JSON.stringify(row.max_submission_score_hist)}"
                                    data-options="${JSON.stringify({
                                      ...histminiOptions,
                                      normalize: true,
                                    })}"
                                  ></div>
                                `
                              : ''}
                          </td>
                          <td class="text-center">
                            ${formatFloat(row.average_average_submission_score, 2)}
                          </td>
                          <td class="text-center">
                            ${formatFloat(row.average_submission_score_variance, 2)}
                          </td>
                          <td class="text-center">
                            ${row.average_submission_score_hist !== null
                              ? html`
                                  <div
                                    class="js-histmini"
                                    data-data="${JSON.stringify(row.average_submission_score_hist)}"
                                    data-options="${JSON.stringify({
                                      ...histminiOptions,
                                      normalize: true,
                                    })}"
                                  ></div>
                                `
                              : ''}
                          </td>
                          <td class="text-center">
                            ${row.submission_score_array_averages !== null
                              ? html`
                                  <div
                                    class="js-histmini"
                                    data-data="${JSON.stringify(
                                      row.submission_score_array_averages,
                                    )}"
                                    data-options="${JSON.stringify(histminiOptions)}"
                                  ></div>
                                `
                              : ''}
                          </td>
                          <td class="text-center">
                            ${row.incremental_submission_score_array_averages !== null
                              ? html`
                                  <div
                                    class="js-histmini"
                                    data-data="${JSON.stringify(
                                      row.incremental_submission_score_array_averages,
                                    )}"
                                    data-options="${JSON.stringify(histminiOptions)}"
                                  ></div>
                                `
                              : ''}
                          </td>
                          ${resLocals.assessment.type !== 'Homework'
                            ? html`
                                <td class="text-center">
                                  ${row.incremental_submission_points_array_averages != null
                                    ? html`
                                        <div
                                          class="js-histmini"
                                          data-data="${JSON.stringify(
                                            row.incremental_submission_points_array_averages,
                                          )}"
                                          data-options="${JSON.stringify({
                                            ...histminiOptions,
                                            ymax: row.max_points,
                                          })}"
                                        ></div>
                                      `
                                    : ''}
                                </td>
                              `
                            : ''}
                          <td class="text-center">
                            ${formatFloat(row.average_number_submissions, 2)}
                          </td>
                          <td class="text-center">
                            ${formatFloat(row.number_submissions_variance, 2)}
                          </td>
                          <td class="text-center">
                            ${row.number_submissions_hist !== null
                              ? html`
                                  <div
                                    class="js-histmini"
                                    data-data="${JSON.stringify(row.number_submissions_hist)}"
                                    data-options="${JSON.stringify({
                                      ...histminiOptions,
                                      normalize: true,
                                    })}"
                                  ></div>
                                `
                              : ''}
                          </td>
                          <td class="text-center">
                            ${row.quintile_question_scores !== null
                              ? html`
                                  <div
                                    class="js-histmini"
                                    data-data="${JSON.stringify(row.quintile_question_scores)}"
                                    data-options="${JSON.stringify({
                                      ...histminiOptions,
                                      ymax: 100,
                                    })}"
                                  ></div>
                                `
                              : ''}
                          </td>
                        `
                      : html`
                          <td
                            class="text-center"
                            colspan="${resLocals.assessment.type === 'Homework' ? 21 : 22}"
                          >
                            Manually-graded question
                          </td>
                        `}
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
        <div class="card-footer">
          <p>
            Download
            <a
              href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                .id}/question_statistics/${questionStatsCsvFilename}"
            >
              ${questionStatsCsvFilename}
            </a>
          </p>
          <div class="small">
            <ul>
              ${Object.keys(STAT_DESCRIPTIONS).map((stat) => {
                return html`
                  <li>
                    <strong>${unsafeHtml(STAT_DESCRIPTIONS[stat].title)}: </strong>
                    ${unsafeHtml(STAT_DESCRIPTIONS[stat].description)}
                  </li>
                `;
              })}
            </ul>
            <p class="mb-0">
              In the case that a student takes this assessment multiple times (e.g., if this
              assessment is a practice exam), we are calculating the above statistics by first
              averaging over all assessment instances for each student, then averaging over
              students.
            </p>
          </div>
        </div>
      </div>
    `,
  });
}
