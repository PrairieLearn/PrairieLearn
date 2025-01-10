import { z } from 'zod';

import { EncodedData } from '@prairielearn/browser-utils';
import { formatInterval } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { HeadContents } from '../../components/HeadContents.html.js';
import { IssueBadge } from '../../components/IssueBadge.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { Scorebar } from '../../components/Scorebar.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  type AssessmentModule,
  AssessmentSchema,
  type AssessmentSet,
  AssessmentSetSchema,
} from '../../lib/db-types.js';

import { type StatsUpdateData } from './instructorAssessments.types.js';

export const AssessmentStatsRowSchema = AssessmentSchema.extend({
  needs_statistics_update: z.boolean().optional(),
});
type AssessmentStatsRow = z.infer<typeof AssessmentStatsRowSchema>;

export const AssessmentRowSchema = AssessmentStatsRowSchema.merge(
  AssessmentSetSchema.pick({ abbreviation: true, name: true, color: true }),
).extend({
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: AssessmentSetSchema.shape.heading,
  label: z.string(),
  open_issue_count: z.coerce.number(),
});
type AssessmentRow = z.infer<typeof AssessmentRowSchema>;

export function InstructorAssessments({
  resLocals,
  rows,
  assessmentIdsNeedingStatsUpdate,
  csvFilename,
  assessmentSets,
  assessmentModules,
  assessmentsGroupBy,
}: {
  resLocals: Record<string, any>;
  rows: AssessmentRow[];
  assessmentIdsNeedingStatsUpdate: string[];
  csvFilename: string;
  assessmentSets: AssessmentSet[];
  assessmentModules: AssessmentModule[];
  assessmentsGroupBy: 'Set' | 'Module';
}) {
  const { urlPrefix, authz_data, course, __csrf_token } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })} ${compiledScriptTag('instructorAssessmentsClient.ts')}
        ${EncodedData<StatsUpdateData>(
          { assessmentIdsNeedingStatsUpdate, urlPrefix },
          'stats-update-data',
        )}
      </head>
      <body>
        ${Navbar({ resLocals })}
        ${CreateAssessmentModal({
          csrfToken: __csrf_token,
          urlPrefix,
          assessmentSets,
          assessmentModules,
          assessmentsGroupBy,
        })}
        <main id="content" class="container-fluid">
          ${CourseInstanceSyncErrorsAndWarnings({
            authz_data,
            courseInstance: resLocals.course_instance,
            course,
            urlPrefix,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h1>Assessments</h1>
              ${authz_data.has_course_permission_edit && !course.example_course && rows.length > 0
                ? html`
                    <button
                      class="btn btn-sm btn-light ml-auto"
                      data-toggle="modal"
                      data-target="#createAssessmentModal"
                    >
                      <i class="fa fa-plus" aria-hidden="true"></i>
                      <span class="d-none d-sm-inline">Add assessment</span>
                    </button>
                  `
                : ''}
            </div>
            ${rows.length > 0
              ? html`
                  <div class="table-responsive">
                    <table class="table table-sm table-hover" aria-label="Assessments">
                      <thead>
                        <tr>
                          <th style="width: 1%"><span class="sr-only">Label</span></th>
                          <th><span class="sr-only">Title</span></th>
                          <th>AID</th>
                          <th class="text-center">Students</th>
                          <th class="text-center">Scores</th>
                          <th class="text-center">Mean Score</th>
                          <th class="text-center">Mean Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${rows.map(
                          (row) => html`
                            ${row.start_new_assessment_group
                              ? html`
                                  <tr>
                                    <th colspan="7" scope="row">${row.assessment_group_heading}</th>
                                  </tr>
                                `
                              : ''}
                            <tr id="row-${row.id}">
                              <td class="align-middle" style="width: 1%">
                                <span class="badge color-${row.color}">${row.label}</span>
                              </td>
                              <td class="align-middle">
                                ${row.sync_errors
                                  ? SyncProblemButton({
                                      type: 'error',
                                      output: row.sync_errors,
                                    })
                                  : row.sync_warnings
                                    ? SyncProblemButton({
                                        type: 'warning',
                                        output: row.sync_warnings,
                                      })
                                    : ''}
                                <a href="${urlPrefix}/assessment/${row.id}/">
                                  ${row.title}
                                  ${row.group_work
                                    ? html` <i class="fas fa-users" aria-hidden="true"></i> `
                                    : ''}
                                </a>
                                ${IssueBadge({ count: row.open_issue_count, urlPrefix })}
                              </td>

                              <td class="align-middle">${row.tid}</td>

                              ${AssessmentStats({ row })}
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div class="card-footer">
                    Download
                    <a href="${urlPrefix}/instance_admin/assessments/file/${csvFilename}">
                      ${csvFilename}
                    </a>
                    (includes more statistics columns than displayed above)
                  </div>
                `
              : html`
                  <div class="my-4 card-body text-center" style="text-wrap: balance;">
                    <p class="font-weight-bold">No assessments found.</p>
                    <p class="mb-0">
                      An assessment is a collection of questions to build or assess a student's
                      knowledge.
                    </p>
                    <p>
                      Learn more in the
                      <a
                        href="https://prairielearn.readthedocs.io/en/latest/assessment/"
                        target="_blank"
                        >assessments documentation</a
                      >.
                    </p>
                    ${run(() => {
                      if (course.example_course) {
                        return html`<p>You can't add assessments to the example course.</p>`;
                      }
                      if (!authz_data.has_course_permission_edit) {
                        return html`<p>Course Editors can create new assessments.</p>`;
                      }
                      return html`
                        <button
                          class="btn btn-sm btn-primary"
                          data-toggle="modal"
                          data-target="#createAssessmentModal"
                        >
                          <i class="fa fa-plus" aria-hidden="true"></i>
                          <span class="d-none d-sm-inline">Add assessment</span>
                        </button>
                      `;
                    })}
                  </div>
                `}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

export function AssessmentStats({ row }: { row: AssessmentStatsRow }) {
  const spinner = html`
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="sr-only">Loading...</span>
    </div>
  `;
  return html`
    <td class="text-center align-middle score-stat-number" style="white-space: nowrap;">
      ${row.needs_statistics_update ? spinner : row.score_stat_number}
    </td>

    <td class="text-center align-middle score-stat-score-hist" style="white-space: nowrap;">
      ${row.needs_statistics_update
        ? spinner
        : row.score_stat_number > 0
          ? html`
              <div
                class="js-histmini d-inline-block"
                data-data="${JSON.stringify(row.score_stat_hist)}"
                data-options="${JSON.stringify({ width: 60, height: 20 })}"
              ></div>
            `
          : html`&mdash;`}
    </td>

    <td class="text-center align-middle score-stat-mean" style="white-space: nowrap;">
      ${row.needs_statistics_update
        ? spinner
        : row.score_stat_number > 0
          ? html`
              <div class="d-inline-block align-middle" style="min-width: 8em; max-width: 20em;">
                ${Scorebar(Math.round(row.score_stat_mean))}
              </div>
            `
          : html`&mdash;`}
    </td>

    <td class="text-center align-middle duration-stat-mean" style="white-space: nowrap;">
      ${row.needs_statistics_update
        ? spinner
        : row.score_stat_number > 0
          ? formatInterval(row.duration_stat_mean)
          : html`&mdash;`}
    </td>
  `;
}

function CreateAssessmentModal({
  csrfToken,
  urlPrefix,
  assessmentSets,
  assessmentModules,
  assessmentsGroupBy,
}: {
  csrfToken: string;
  urlPrefix: string;
  assessmentSets: AssessmentSet[];
  assessmentModules: AssessmentModule[];
  assessmentsGroupBy: 'Set' | 'Module';
}) {
  return Modal({
    id: 'createAssessmentModal',
    title: 'Create assessment',
    formMethod: 'POST',
    body: html`
      <div class="form-group">
        <label for="title">Title</label>
        <input
          type="text"
          class="form-control"
          id="title"
          name="title"
          required
          aria-describedby="title_help"
        />
        <small id="title_help" class="form-text text-muted">
          The full name of the assessment, visible to users.
        </small>
      </div>
      <div class="form-group">
        <label for="aid">Assessment identifier (AID)</label>
        <input
          type="text"
          class="form-control"
          id="aid"
          name="aid"
          required
          pattern="[\\-A-Za-z0-9_\\/]+"
          aria-describedby="aid_help"
        />
        <small id="aid_help" class="form-text text-muted">
          A short unique identifier for this assessment, such as "exam1-functions" or
          "hw2-derivatives". Use only letters, numbers, dashes, and underscores, with no spaces.
        </small>
      </div>
      <div class="form-group">
        <label for="type">Type</label>
        <select class="form-select" id="type" name="type" aria-describedby="type_help" required>
          <option value="Homework">Homework</option>
          <option value="Exam">Exam</option>
        </select>
        <small id="type_help" class="form-text text-muted">
          The type of the assessment. This can be either Homework or Exam.
        </small>
      </div>
      <div class="form-group">
        <label for="set">Set</label>
        <select class="form-select" id="set" name="set" aria-describedby="set_help" required>
          ${assessmentSets.map((set) => html`<option value="${set.name}">${set.name}</option>`)}
        </select>
        <small id="set_help" class="form-text text-muted">
          The <a href="${urlPrefix}/course_admin/sets">assessment set</a> this assessment belongs
          to.
        </small>
      </div>
      ${assessmentsGroupBy === 'Module'
        ? html`
            <div class="form-group">
              <label for="module">Module</label>
              <select
                class="form-select"
                id="module"
                name="module"
                aria-describedby="module_help"
                required
              >
                ${assessmentModules.map(
                  (module) => html`<option value="${module.name}">${module.name}</option>`,
                )}
              </select>
              <small id="module_help" class="form-text text-muted">
                The <a href="${urlPrefix}/course_admin/modules">module</a> this assessment belongs
                to.
              </small>
            </div>
          `
        : ''}
    `,
    footer: html`
      <input type="hidden" name="__action" value="add_assessment" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Create</button>
    `,
  });
}
