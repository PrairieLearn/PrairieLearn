import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { AssessmentAccessRuleRow } from './instructorAssessmentAccess.types.js';

/**
 *
 * This function adjusts the date to accommodate a situation where the local timezone is different from the timezone of the course. It does so by creating a new date object of the given date object or string and finding the local timezone offset (in milliseconds). Then it returns a new date object with the timezone offset subtracted from the original date.
 *
 * @param dateString - The date string to adjust
 */
export function adjustedDate(dateString: string | Date) {
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
  accessRules: AssessmentAccessRuleRow[];
  ptHost: string;
  devMode: boolean;
  hasCourseInstancePermissionView: boolean;
  editMode: boolean;
  timezone: string;
}) {
  return html`
    <div
      class="table-responsive js-access-rules-table"
      data-pt-host="${ptHost}"
      data-dev-mode="${devMode}"
      data-has-course-instance-permission-view="${hasCourseInstancePermissionView}"
      data-timezone="${timezone}"
    >
      <table class="table table-sm">
        <thead>
          <tr>
            ${editMode ? html`<th>Actions</th>` : ''}
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
              <tr data-index="${index}">
                ${editMode
                  ? html`
                      <td class="align-content-center">
                        <div class="d-flex flex-row align-items-center">
                          <div class="d-flex flex-column">
                            <button
                              class="btn btn-xs btn-secondary js-up-arrow-button mb-1"
                              type="button"
                              ${index === 0 ? 'disabled' : ''}
                            >
                              <i class="fa fa-arrow-up" aria-hidden="true"></i>
                            </button>
                            <button
                              class="btn btn-xs btn-secondary js-down-arrow-button"
                              type="button"
                              ${index === accessRules.length - 1 ? 'disabled' : ''}
                            >
                              <i class="fa fa-arrow-down" aria-hidden="true"></i>
                            </button>
                          </div>
                          <button
                            class="btn btn-sm btn-secondary ml-2 js-edit-access-rule-button"
                            type="button"
                            data-toggle="modal"
                            data-target="editAccessRuleModal"
                          >
                            <i class="fa fa-edit" aria-hidden="true"></i>
                          </button>
                          <button
                            class="btn btn-sm btn-danger ml-2 js-delete-access-rule-button"
                            type="button"
                            data-toggle="modal"
                            data-target="deleteAccessRuleModal"
                          >
                            <i class="fa fa-trash" aria-hidden="true"></i>
                          </button>
                        </div>
                      </td>
                    `
                  : ''}
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
                  ${access_rule.assessment_access_rule.start_date
                    ? formatDate(
                        new Date(access_rule.assessment_access_rule.start_date ?? ''),
                        timezone,
                      )
                    : '—'}
                </td>
                <td class="align-content-center">
                  ${access_rule.assessment_access_rule.end_date
                    ? formatDate(
                        new Date(access_rule.assessment_access_rule.end_date ?? ''),
                        timezone,
                      )
                    : '—'}
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
              <button class="btn btn-sm js-add-rule-button" type="button">
                <i class="fa fa-plus" aria-hidden="true"></i> Add Access Rule
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
