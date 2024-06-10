import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { AssessmentAccessRules } from './instructorAssessmentAccess.types.js';

function adjustedDate(dateString: string | Date) {
  const date = new Date(dateString);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset);
}

export function AccessRulesTable({
  accessRules,
  ptHost,
  devMode,
  hasCourseInstancePermissionView,
  editMode,
  timezone,
}: {
  accessRules: AssessmentAccessRules[];
  ptHost: string;
  devMode: boolean;
  hasCourseInstancePermissionView: boolean;
  editMode: boolean;
  timezone: string;
}) {
  return html`
    <div
      class="table-responsive js-access-rules-table"
      id="table-responsive"
      data-pt-host="${ptHost}"
      data-dev-mode="${devMode}"
      data-has-course-instance-permission-view="${hasCourseInstancePermissionView}"
      data-timezone="${timezone}"
    >
      <table class="table table-sm">
        <thead>
          <tr id="tableHeaderRow">
            <th id="arrowButtonsHeader" ${editMode ? '' : 'hidden'}></th>
            <th id="editButtonHeader" ${editMode ? '' : 'hidden'}></th>
            <th id="deleteButtonHeader" ${editMode ? '' : 'hidden'}></th>
            <th>Mode</th>
            <th>UIDs</th>
            <th>Start date</th>
            <th>End date</th>
            <th>Active</th>
            <th>Credit</th>
            <th>Time limit</th>
            <th>Password</th>
            <th>PrairieTest</th>
          </tr>
        </thead>
        <tbody>
          ${accessRules.map((access_rule, index) => {
            // Only users with permission to view student data are allowed
            // to see the list of uids associated with an access rule. Note,
            // however, that any user with permission to view course code
            // (or with access to the course git repository) will be able to
            // see the list of uids, because these access rules are defined
            // in course code. This should be changed in future, to protect
            // student data. See https://github.com/PrairieLearn/PrairieLearn/issues/3342
            return html`
              <tr>
                <td class="arrowButtonsCell align-content-center" ${editMode ? '' : 'hidden'}>
                  <div>
                    <button
                      class="btn btn-xs btn-secondary up-arrow-button"
                      type="button"
                      data-row="${index}"
                      ${index === 0 ? 'disabled' : ''}
                    >
                      <i class="fa fa-arrow-up" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div>
                    <button
                      class="btn btn-xs btn-secondary down-arrow-button"
                      type="button"
                      data-row="${index}"
                      ${index === accessRules.length - 1 ? 'disabled' : ''}
                    >
                      <i class="fa fa-arrow-down" aria-hidden="true"></i>
                    </button>
                  </div>
                </td>
                <td class="editButtonCell align-content-center" ${editMode ? '' : 'hidden'}>
                  <button
                    class="btn btn-sm btn-secondary editButton"
                    type="button"
                    data-row="${index}"
                    data-toggle="modal"
                    data-target="editAccessRuleModal"
                    data-access-rule-mode="${access_rule.assessment_access_rule.mode}"
                    data-access-rule-uids="${access_rule.assessment_access_rule.uids
                      ? access_rule.assessment_access_rule.uids.join(', ')
                      : ''}"
                    data-access-rule-start-date="${adjustedDate(
                      formatDate(
                        new Date(access_rule.assessment_access_rule.start_date ?? ''),
                        timezone,
                      ),
                    )
                      .toISOString()
                      .slice(0, 19)}"
                    data-access-rule-end-date="${adjustedDate(
                      formatDate(
                        new Date(access_rule.assessment_access_rule.end_date ?? ''),
                        timezone,
                      ),
                    )
                      .toISOString()
                      .slice(0, 19)}"
                    data-access-rule-active="${access_rule.assessment_access_rule.active}"
                    data-access-rule-credit="${access_rule.assessment_access_rule.credit}"
                    data-access-rule-time-limit="${access_rule.assessment_access_rule
                      .time_limit_min}"
                    data-access-rule-password="${access_rule.assessment_access_rule.password}"
                    data-access-rule-exam-uuid="${access_rule.assessment_access_rule.exam_uuid}"
                    data-title-text="Edit Access Rule"
                    data-submit-text="Update Access Rule"
                  >
                    <i class="fa fa-edit" aria-hidden="true"></i>
                  </button>
                </td>
                <td class="deleteButtonCell align-content-center" ${editMode ? '' : 'hidden'}>
                  <button
                    class="btn btn-sm btn-danger deleteButton"
                    type="button"
                    data-row="${index}"
                    data-toggle="modal"
                    data-target="deleteAccessRuleModal"
                  >
                    <i class="fa fa-trash" aria-hidden="true"></i>
                  </button>
                </td>
                <td class="align-content-center">
                  ${access_rule.assessment_access_rule.mode !== null
                    ? access_rule.assessment_access_rule.mode
                    : '—'}
                </td>
                <td class="align-content-center">
                  ${hasCourseInstancePermissionView
                    ? access_rule.assessment_access_rule.uids
                      ? access_rule.assessment_access_rule.uids[0] !== ''
                        ? access_rule.assessment_access_rule.uids.join(', ')
                        : '—'
                      : '—'
                    : html`
                          <button
                            class="btn btn-xs btn-warning"
                            type="button"
                            data-toggle="popover"
                            data-trigger="focus"
                            data-container="body"
                            data-placement="auto"
                            title="Hidden UIDs"
                            data-content="This access rule is specific to individual students. You need permission to view student data in order to see which ones."
                          >
                            Hidden
                          </a>
                        `}
                </td>
                <td class="align-content-center">
                  ${formatDate(
                    new Date(access_rule.assessment_access_rule.start_date ?? ''),
                    timezone,
                  )}
                </td>
                <td class="align-content-center">
                  ${formatDate(
                    new Date(access_rule.assessment_access_rule.end_date ?? ''),
                    timezone,
                  )}
                </td>
                <td class="align-content-center">
                  ${access_rule.assessment_access_rule.active ? 'True' : 'False'}
                </td>
                <td class="align-content-center">
                  ${access_rule.assessment_access_rule.credit
                    ? `${access_rule.assessment_access_rule.credit}%`
                    : '—'}
                </td>
                <td class="align-content-center">
                  ${access_rule.assessment_access_rule.time_limit_min
                    ? `${access_rule.assessment_access_rule.time_limit_min} mins`
                    : '—'}
                </td>
                <td class="align-content-center">
                  ${access_rule.assessment_access_rule.password
                    ? access_rule.assessment_access_rule.password
                    : '—'}
                </td>
                <td class="align-content-center">
                  ${access_rule.pt_exam && access_rule.pt_course
                    ? html`
                        <a
                          href="${ptHost}/pt/course/${access_rule.pt_course
                            .id}/staff/exam/${access_rule.pt_exam.id}"
                        >
                          ${access_rule.pt_course.name}: ${access_rule.pt_exam.name}
                        </a>
                      `
                    : access_rule.assessment_access_rule.exam_uuid
                      ? devMode
                        ? access_rule.assessment_access_rule.exam_uuid
                        : html`
                            <span class="text-danger">
                              Exam not found: ${access_rule.assessment_access_rule.exam_uuid}
                            </span>
                          `
                      : html`&mdash;`}
                </td>
              </tr>
            `;
          })}
          <tr ${editMode ? '' : 'hidden'}>
            <td colspan="12">
              <button
                id="addRuleButton"
                class="btn btn-sm"
                type="button"
                data-row="${accessRules.length}"
                data-toggle="modal"
                data-target="editAccessRuleModal"
                data-access-rule-mode=""
                data-access-rule-uids=""
                data-access-rule-start-date="${adjustedDate(new Date()).toISOString().slice(0, 19)}"
                data-access-rule-end-date="${adjustedDate(new Date()).toISOString().slice(0, 19)}"
                data-access-rule-active="true"
                data-access-rule-credit=""
                data-access-rule-time-limit=""
                data-access-rule-password=""
                data-access-rule-exam-uuid=""
                data-title-text="Add Access Rule"
                data-submit-text="Add Access Rule"
              >
                <i class="fa fa-plus" aria-hidden="true"></i> Add Access Rule
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
