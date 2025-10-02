import { EncodedData } from '@prairielearn/browser-utils';
import { formatInterval } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';
import { run } from '@prairielearn/run';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.js';
import { IssueBadgeHtml } from '../../components/IssueBadge.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { ScorebarHtml } from '../../components/Scorebar.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { SyncProblemButtonHtml } from '../../components/SyncProblemButton.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { type AssessmentModule, type AssessmentSet } from '../../lib/db-types.js';
import { type AssessmentRow, type AssessmentStatsRow } from '../../models/assessment.js';

import { type StatsUpdateData } from './instructorAssessments.types.js';

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

  return PageLayout({
    resLocals,
    pageTitle: 'Assessments',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'assessments',
    },
    options: {
      fullWidth: true,
    },
    headContent: html`
      ${compiledScriptTag('instructorAssessmentsClient.ts')}
      ${EncodedData<StatsUpdateData>(
        { assessmentIdsNeedingStatsUpdate, urlPrefix },
        'stats-update-data',
      )}
    `,
    content: html`
      ${renderHtml(
        <CourseInstanceSyncErrorsAndWarnings
          authzData={authz_data}
          courseInstance={resLocals.course_instance}
          course={course}
          urlPrefix={urlPrefix}
        />,
      )}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Assessments</h1>
          ${authz_data.has_course_permission_edit && !course.example_course && rows.length > 0
            ? html`
                <button
                  type="button"
                  class="btn btn-sm btn-light ms-auto"
                  data-bs-toggle="modal"
                  data-bs-target="#createAssessmentModal"
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
                      <th style="width: 1%"><span class="visually-hidden">Label</span></th>
                      <th><span class="visually-hidden">Title</span></th>
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
                                <th colspan="7" scope="row">
                                  ${assessmentsGroupBy === 'Set'
                                    ? AssessmentSetHeading({ assessment_set: row.assessment_set })
                                    : AssessmentModuleHeading({
                                        assessment_module: row.assessment_module,
                                      })}
                                </th>
                              </tr>
                            `
                          : ''}
                        <tr id="row-${row.id}">
                          <td class="align-middle" style="width: 1%">
                            <span class="badge color-${row.assessment_set.color}">
                              ${row.label}
                            </span>
                          </td>
                          <td class="align-middle">
                            ${row.sync_errors
                              ? SyncProblemButtonHtml({
                                  type: 'error',
                                  output: row.sync_errors,
                                })
                              : row.sync_warnings
                                ? SyncProblemButtonHtml({
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
                            ${IssueBadgeHtml({
                              count: row.open_issue_count,
                              urlPrefix,
                              issueAid: row.tid,
                            })}
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
                <p class="fw-bold">No assessments found.</p>
                <p class="mb-0">
                  An assessment is a collection of questions to build or assess a student's
                  knowledge.
                </p>
                <p>
                  Learn more in the
                  <a
                    href="https://prairielearn.readthedocs.io/en/latest/assessment/"
                    target="_blank"
                    rel="noreferrer"
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
                      type="button"
                      class="btn btn-sm btn-primary"
                      data-bs-toggle="modal"
                      data-bs-target="#createAssessmentModal"
                    >
                      <i class="fa fa-plus" aria-hidden="true"></i>
                      <span class="d-none d-sm-inline">Add assessment</span>
                    </button>
                  `;
                })}
              </div>
            `}
      </div>
    `,
    postContent: html`
      ${CreateAssessmentModal({
        csrfToken: __csrf_token,
        urlPrefix,
        assessmentSets,
        assessmentModules,
        assessmentsGroupBy,
      })}
    `,
  });
}

export function AssessmentStats({ row }: { row: AssessmentStatsRow }) {
  const spinner = html`
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="visually-hidden">Loading...</span>
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
                ${ScorebarHtml(Math.round(row.score_stat_mean))}
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
      <div class="mb-3">
        <label class="form-label" for="title">Title</label>
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
      <div class="mb-3">
        <label class="form-label" for="aid">Assessment identifier (AID)</label>
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
      <div class="mb-3">
        <label class="form-label" for="type">Type</label>
        <select class="form-select" id="type" name="type" aria-describedby="type_help" required>
          <option value="Homework">Homework</option>
          <option value="Exam">Exam</option>
        </select>
        <small id="type_help" class="form-text text-muted">
          The type of the assessment. This can be either Homework or Exam.
        </small>
      </div>
      <div class="mb-3">
        <label class="form-label" for="set">Set</label>
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
            <div class="mb-3">
              <label class="form-label" for="module">Module</label>
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
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Create</button>
    `,
  });
}
