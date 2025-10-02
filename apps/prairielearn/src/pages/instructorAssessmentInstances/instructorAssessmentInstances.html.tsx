import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';

export function InstructorAssessmentInstances({ resLocals }: { resLocals: Record<string, any> }) {
  return PageLayout({
    resLocals,
    pageTitle: 'Instances',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'instances',
    },
    options: {
      fullWidth: true,
    },
    headContent: html`
      <script src="${nodeModulesAssetPath('bootstrap-table/dist/bootstrap-table.min.js')}"></script>
      <script src="${nodeModulesAssetPath(
          'bootstrap-table/dist/extensions/auto-refresh/bootstrap-table-auto-refresh.js',
        )}"></script>
      <link
        href="${nodeModulesAssetPath('bootstrap-table/dist/bootstrap-table.min.css')}"
        rel="stylesheet"
      />
      <link
        href="${nodeModulesAssetPath(
          'bootstrap-table/dist/extensions/sticky-header/bootstrap-table-sticky-header.min.css',
        )}"
        rel="stylesheet"
      />
      ${compiledScriptTag('bootstrap-table-sticky-header.js')}
      ${compiledScriptTag('instructorAssessmentInstancesClient.tsx')}
    `,
    content: html`
      ${renderHtml(
        <AssessmentSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          assessment={resLocals.assessment}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      ${resLocals.authz_data.has_course_instance_permission_edit
        ? html`
            ${DeleteAssessmentInstanceModal({
              assessmentSetName: resLocals.assessment_set.name,
              assessmentNumber: resLocals.assessment.number,
              assessmentGroupWork: resLocals.assessment.group_work,
              csrfToken: resLocals.__csrf_token,
            })}
            ${DeleteAllAssessmentInstancesModal({
              assessmentSetName: resLocals.assessment_set.name,
              assessmentNumber: resLocals.assessment.number,
              csrfToken: resLocals.__csrf_token,
            })}
            ${GradeAllAssessmentInstancesModal({
              assessmentSetName: resLocals.assessment_set.name,
              assessmentNumber: resLocals.assessment.number,
              csrfToken: resLocals.__csrf_token,
            })}
            ${CloseAllAssessmentInstancesModal({
              assessmentSetName: resLocals.assessment_set.name,
              assessmentNumber: resLocals.assessment.number,
              csrfToken: resLocals.__csrf_token,
            })}
          `
        : ''}

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center gap-2">
          <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Students</h1>
          ${resLocals.authz_data.has_course_instance_permission_edit
            ? html`
                <div class="ms-auto">
                  <div class="dropdown d-flex flex-row">
                    <button
                      type="button"
                      class="btn btn-light dropdown-toggle"
                      data-bs-toggle="dropdown"
                      aria-haspopup="true"
                      aria-expanded="false"
                    >
                      Action for all instances <span class="caret"></span>
                    </button>
                    <div class="dropdown-menu dropdown-menu-end">
                      ${resLocals.authz_data.has_course_instance_permission_edit
                        ? html`
                            <button
                              type="button"
                              class="dropdown-item"
                              data-bs-toggle="modal"
                              data-bs-target="#deleteAllAssessmentInstancesModal"
                            >
                              <i class="fas fa-times" aria-hidden="true"></i> Delete all instances
                            </button>
                            <button
                              type="button"
                              class="dropdown-item time-limit-edit-button time-limit-edit-all-button"
                              data-bs-placement="left"
                              data-bs-toggle-popover
                            >
                              <i class="far fa-clock" aria-hidden="true"></i> Change time limit for
                              all instances
                            </button>
                            <button
                              type="button"
                              class="dropdown-item"
                              data-bs-toggle="modal"
                              data-bs-target="#grade-all-form"
                            >
                              <i class="fas fa-clipboard-check" aria-hidden="true"></i> Grade all
                              instances
                            </button>
                            <button
                              type="button"
                              class="dropdown-item"
                              data-bs-toggle="modal"
                              data-bs-target="#closeAllAssessmentInstancesModal"
                            >
                              <i class="fas fa-ban" aria-hidden="true"></i> Grade and close all
                              instances
                            </button>
                          `
                        : html`
                            <button class="dropdown-item disabled" disabled>
                              Must have editor permission
                            </button>
                          `}
                    </div>
                  </div>
                </div>
              `
            : ''}
        </div>

        <table
          id="usersTable"
          aria-label="Assessment instances"
          data-unique-id="assessment_instance_id"
          data-classes="table table-sm table-hover table-bordered"
          data-show-button-text="true"
          data-url="${resLocals.urlPrefix}/assessment/${resLocals.assessment
            .id}/instances/raw_data.json"
          data-search="true"
          data-show-columns="true"
          data-show-refresh="true"
          data-auto-refresh="true"
          data-auto-refresh-status="false"
          data-auto-refresh-interval="30"
          data-buttons-order="['refresh', 'autoRefresh', 'columns']"
          data-thead-classes="table-light"
          data-pagination="true"
          data-pagination-v-align="both"
          data-pagination-h-align="left"
          data-pagination-detail-h-align="right"
          data-toolbar=".fixed-table-pagination:nth(0)"
          data-page-list="[10,20,50,100,200,500,unlimited]"
          data-page-size="50"
          data-smart-display="false"
          data-show-extended-pagination="true"
          data-sticky-header="true"
          data-assessment-group-work="${resLocals.assessment.group_work}"
          data-assessment-multiple-instance="${resLocals.assessment.multiple_instance}"
          data-assessment-number="${resLocals.assessment.number}"
          data-url-prefix="${resLocals.urlPrefix}"
          data-assessment-set-abbr="${resLocals.assessment_set.abbreviation}"
          data-csrf-token="${resLocals.__csrf_token}"
          data-has-course-instance-permission-edit="${resLocals.authz_data
            .has_course_instance_permission_edit}"
          data-timezone="${resLocals.course_instance.display_timezone}"
        ></table>

        <div class="spinning-wheel card-body spinner-border">
          <span class="visually-hidden">Loading...</span>
        </div>

        ${RoleHelpModal()} ${FingerprintChangesHelpModal()} ${DurationHelpModal()}
        ${TimeRemainingHelpModal()}
      </div>
    `,
  });
}

function RoleHelpModal() {
  return Modal({
    id: 'role-help',
    title: 'Roles',
    form: false,
    body: html`
      <ul>
        <li>
          <strong>Staff</strong> is a member of the course staff. They can see the data of all
          users, and depending on course settings may have permission to edit the information of
          other users.
        </li>
        <li>
          <strong>Student</strong> is a student participating in the class. They can only see their
          own information, and can do assessments.
        </li>
        <li>
          <strong>None</strong> is a user who at one point added the course and later removed
          themselves. They can no longer access the course but their work done within the course has
          been retained.
        </li>
      </ul>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
    `,
  });
}

function FingerprintChangesHelpModal() {
  return Modal({
    id: 'fingerprint-changes-help',
    title: 'Client Fingerprints',
    form: false,
    body: html`
      <p>
        Client fingerprints are a record of a user's IP address, user agent and session. These
        attributes are tracked while a user is accessing an assessment. This value indicates the
        amount of times that those attributes changed as the student accessed the assessment, while
        the assessment was active. Some changes may naturally occur during an assessment, such as if
        a student changes network connections or browsers. However, a high number of changes in an
        exam-like environment could be an indication of multiple people accessing the same
        assessment simultaneously, which may suggest an academic integrity issue. Accesses taking
        place after the assessment has been closed are not counted, as they typically indicate
        scenarios where a student is reviewing their results, which may happen outside of a
        controlled environment.
      </p>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
    `,
  });
}

function DurationHelpModal() {
  return Modal({
    id: 'duration-help',
    title: 'Duration',
    form: false,
    body: html`
      <p>
        The "Duration" is the amount of time that a student has spent actively working on the
        assessment. The duration time measurement begins when the student starts the assessment and
        continues until the most recent answer submission.
      </p>
      <p>
        <strong>For Homework assessments</strong>, a student is considered to be actively working if
        they have at least one answer submission per hour, so the duration measurement is paused if
        there is a gap of more than one hour between answer submissions. For example:
      </p>
      <ul>
        <li>08:00 - student starts assessment;</li>
        <li>08:30 - student submits answer;</li>
        <li>09:00 - student submits answer;</li>
        <li>(gap of more than one hour)</li>
        <li>11:00 - student submits answer;</li>
        <li>11:30 - student submits answer;</li>
        <li>12:00 - student submits answer.</li>
      </ul>
      <p>
        In the above example, the "duration" would be 2 hours: one hour from 08:00 to 09:00, and
        another hour from 11:00 to 12:00. The two-hour gap between 09:00 to 11:00 is not counted as
        part of the duration.
      </p>
      <p>
        <strong>For Exam assessments</strong>, a student is considered to be actively working
        between the start of the assessment and the last submission, regardless of any potential
        inactivity. For the same example above, the "duration" would be 4 hours, from 08:00 to
        12:00. The two-hour gap is not considered inactivity, since it is assumed that this kind of
        assessment requires students to be active for the duration of the assessment.
      </p>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
    `,
  });
}

function TimeRemainingHelpModal() {
  return Modal({
    id: 'time-remaining-help',
    title: 'Time Remaining',
    form: false,
    body: html`
      <p>
        For open assessments with a time limit, this column will indicate the number of minutes
        (rounded down) the student has left to complete the assessment. If the value is
        <strong>&lt; 1 min</strong>, the student has less than one minute to complete it. This
        column may also contain one of the following special values.
      </p>
      <ul>
        <li>
          <strong>Expired</strong> indicates the assessment time limit has expired, and will be
          automatically closed as soon as possible. If an assessment is Expired for a prolonged
          period of time, this typically means the student has closed their browser or lost
          connectivity, and the assessment will be closed as soon as the student opens the
          assessment. No further submissions are accepted at this point.
        </li>
        <li>
          <strong>Closed</strong> indicates the assessment has been closed, and no further
          submissions are accepted.
        </li>
        <li>
          <strong>Open (no time limit)</strong> indicates that the assessment is still open and
          accepting submissions, and there is no time limit to submit the assessment (other than
          those indicated by access rules).
        </li>
      </ul>
    `,
    footer: html`
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
    `,
  });
}

function DeleteAssessmentInstanceModal({
  assessmentSetName,
  assessmentNumber,
  assessmentGroupWork,
  csrfToken,
}: {
  assessmentSetName: string;
  assessmentNumber: number;
  assessmentGroupWork: boolean;
  csrfToken: string;
}) {
  return Modal({
    id: 'deleteAssessmentInstanceModal',
    title: 'Delete assessment instance',
    body: html`
      Are you sure you want to delete assessment instance
      <span class="modal-number"></span> of
      <strong> ${assessmentSetName} ${assessmentNumber} </strong>
      for
      ${assessmentGroupWork
        ? html`
            <strong><span class="modal-group-name"></span></strong>
            (<span class="modal-uid-list"></span>)
          `
        : html`
            <strong><span class="modal-name"></span></strong>
            (<span class="modal-uid"></span>)
          `}
      started at
      <strong><span class="modal-date"></span></strong> with a score of
      <strong><span class="modal-score-perc"></span>%</strong>?
    `,
    footer: html`
      <input type="hidden" name="__action" value="delete" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input
        type="hidden"
        name="assessment_instance_id"
        class="modal-assessment-instance-id"
        value=""
      />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Delete</button>
    `,
  });
}

function DeleteAllAssessmentInstancesModal({
  assessmentSetName,
  assessmentNumber,
  csrfToken,
}: {
  assessmentSetName: string;
  assessmentNumber: number;
  csrfToken: string;
}) {
  return Modal({
    id: 'deleteAllAssessmentInstancesModal',
    title: 'Delete all assessment instances',
    body: html`
      Are you sure you want to delete all assessment instances for
      <strong> ${assessmentSetName} ${assessmentNumber} </strong>
      ? This cannot be undone.
    `,
    footer: html`
      <input type="hidden" name="__action" value="delete_all" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Delete all</button>
    `,
  });
}

function GradeAllAssessmentInstancesModal({
  assessmentSetName,
  assessmentNumber,
  csrfToken,
}: {
  assessmentSetName: string;
  assessmentNumber: number;
  csrfToken: string;
}) {
  return Modal({
    id: 'grade-all-form',
    title: 'Grade all assessment instances',
    body: html`
      Are you sure you want to grade pending submissions for all assessment instances for
      <strong>${assessmentSetName} ${assessmentNumber}</strong>? This cannot be undone.
    `,
    footer: html`
      <input type="hidden" name="__action" value="grade_all" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Grade all</button>
    `,
  });
}

function CloseAllAssessmentInstancesModal({
  assessmentSetName,
  assessmentNumber,
  csrfToken,
}: {
  assessmentSetName: string;
  assessmentNumber: number;
  csrfToken: string;
}) {
  return Modal({
    id: 'closeAllAssessmentInstancesModal',
    title: 'Grade and Close all assessment instances',
    body: html`
      Are you sure you want to grade and close all assessment instances for
      <strong>${assessmentSetName} ${assessmentNumber}</strong>? This cannot be undone.
    `,
    footer: html`
      <input type="hidden" name="__action" value="close_all" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Grade and Close all</button>
    `,
  });
}
