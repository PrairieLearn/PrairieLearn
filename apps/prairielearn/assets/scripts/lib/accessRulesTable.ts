import { html } from '@prairielearn/html';

export function AccessRulesTable({
  accessRules,
  ptHost,
  devMode,
  hasCourseInstancePermissionView,
  editMode,
}: {
  accessRules: any[];
  ptHost: string;
  devMode: boolean;
  hasCourseInstancePermissionView: boolean;
  editMode: boolean;
}) {
  return html`
    <div
      class="table-responsive js-access-rules-table"
      id="table-responsive"
      data-pt-host="${ptHost}"
      data-dev-mode="${devMode}"
      data-has-course-instance-permission-view="${hasCourseInstancePermissionView}"
      data-timezone
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
          ${accessRules.map((access_rule, i) => {
            // Only users with permission to view student data are allowed
            // to see the list of uids associated with an access rule. Note,
            // however, that any user with permission to view course code
            // (or with access to the course git repository) will be able to
            // see the list of uids, because these access rules are defined
            // in course code. This should be changed in future, to protect
            // student data. See https://github.com/PrairieLearn/PrairieLearn/issues/3342
            return html`
              <tr class="tableDataRow">
                <td class="arrowButtonsCell align-content-center" ${editMode ? '' : 'hidden'}>
                  <div>
                    <button
                      class="btn btn-xs btn-secondary up-arrow-button"
                      type="button"
                      data-row="${i}"
                    >
                      <i class="fa fa-arrow-up" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div>
                    <button
                      class="btn btn-xs btn-secondary down-arrow-button"
                      type="button"
                      data-row="${i}"
                    >
                      <i class="fa fa-arrow-down" aria-hidden="true"></i>
                    </button>
                  </div>
                </td>
                <td class="editButtonCell align-content-center" ${editMode ? '' : 'hidden'}>
                  <button class="btn btn-sm btn-secondary editButton" type="button" data-row="${i}">
                    <i class="fa fa-edit" aria-hidden="true"></i>
                  </button>
                </td>
                <td class="deleteButtonCell align-content-center" ${editMode ? '' : 'hidden'}>
                  <button
                    class="btn btn-sm btn-danger deleteButton"
                    type="button"
                    data-row="${i}"
                    data-toggle="modal"
                    data-target="deleteAccessRuleModal"
                  >
                    <i class="fa fa-trash" aria-hidden="true"></i>
                  </button>
                </td>
                <td class="align-content-center">
                  ${access_rule.mode.length > 0 ? access_rule.mode : '—'}
                </td>
                <td class="align-content-center">
                  ${access_rule.uids === '' || hasCourseInstancePermissionView
                    ? access_rule.uids.length > 0
                      ? access_rule.uids
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
                <td class="align-content-center">${access_rule.start_date}</td>
                <td class="align-content-center">${access_rule.end_date}</td>
                <td class="align-content-center">${access_rule.active}</td>
                <td class="align-content-center">${access_rule.credit}%</td>
                <td class="align-content-center">${access_rule.time_limit} mins</td>
                <td class="align-content-center">
                  ${access_rule.password.length > 0 ? access_rule.password : '—'}
                </td>
                <td class="align-content-center">
                  ${access_rule.pt_exam_name
                    ? html`
                        <a
                          href="${ptHost}/pt/course/${access_rule.pt_course_id}/staff/exam/${access_rule.pt_exam_id}"
                        >
                          ${access_rule.pt_course_name}: ${access_rule.pt_exam_name}
                        </a>
                      `
                    : access_rule.exam_uuid
                      ? devMode
                        ? access_rule.exam_uuid
                        : html`
                            <span class="text-danger">
                              Exam not found: ${access_rule.exam_uuid}
                            </span>
                          `
                      : html`&mdash;`}
                </td>
              </tr>
            `;
          })}
          <tr class="tableDataRow" ${editMode ? '' : 'hidden'}>
            <td colspan="12">
              <button id="addRuleButton" class="btn btn-sm" type="button">
                <i class="fa fa-plus" aria-hidden="true"></i> Add Access Rule
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
