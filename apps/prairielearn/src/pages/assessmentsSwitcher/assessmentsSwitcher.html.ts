import { html } from '@prairielearn/html';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.html.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.html.js';
import type { NavSubPage } from '../../components/Navbar.types.js';
import type { AssessmentRow } from '../../lib/assessment.js';
import { idsEqual } from '../../lib/id.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';
import { IssueBadge } from '../../components/IssueBadge.html.js';

export function AssessmentSwitcher({
  assessmentRows,
  assessmentsGroupBy,
  currentAssessmentId,
  courseInstanceId,
  plainUrlPrefix,
  targetSubPage,
}: {
  assessmentRows: AssessmentRow[];
  assessmentsGroupBy: 'Set' | 'Module';
  currentAssessmentId?: string;
  courseInstanceId: string;
  plainUrlPrefix: string;
  /* The subPage that assessment links should redirect to. */
  targetSubPage?: NavSubPage;
}) {
  if (assessmentRows.length === 0) {
    return html`
      <p class="m-0">No assessments</p>
    `.toString();
  }

  return html`
    <div class="table-responsive">
      <table class="table table-borderless table-sm table-hover" aria-label="Assessments">
        <tbody>
          ${assessmentRows.map((row) => {
                  
            const isActive = currentAssessmentId
            ? idsEqual(currentAssessmentId, row.id)
            : false;

            return html`
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

              <tr id="row-${row.id}" class="${isActive ? 'bg-primary text-white' : ''}" style="cursor: pointer;">
                <td class="align-middle" style="width: 1%">
                  <span class="badge color-${row.assessment_set.color}">
                    ${row.label}
                  </span>
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
                  <span>
                    <a
                      class="${isActive ? 'text-white' : ''}"
                      aria-current="${isActive ? 'page' : ''}"
                      aria-label="${row.label}"
                      href="${plainUrlPrefix}/course_instance/${courseInstanceId}/instructor/assessment/${row.id}/${targetSubPage ??
                      ''}"
                    >
                      ${row.title}
                      ${row.group_work
                        ? html` <i class="fas fa-users" aria-hidden="true"></i> `
                        : ''}
                    </a>
                  </span>
                  ${IssueBadge({
                    count: row.open_issue_count,
                    urlPrefix: plainUrlPrefix,
                    issueAid: row.tid,
                  })}
                </td>
                <td class="align-middle">${row.tid}</td>
              </tr>
          `})}
        </tbody>
      </table>
    </div>
  `.toString();


  return html`
    ${assessmentRows.map((assessmentDropdownItemData) => {
      const isActive = currentAssessmentId
        ? idsEqual(currentAssessmentId, assessmentDropdownItemData.id)
        : false;
      return html`
        ${assessmentDropdownItemData.start_new_assessment_group
          ? html`
              <h6 class="dropdown-header">
                ${assessmentsGroupBy === 'Set'
                  ? AssessmentSetHeading({
                      assessment_set: assessmentDropdownItemData.assessment_set,
                    })
                  : AssessmentModuleHeading({
                      assessment_module: assessmentDropdownItemData.assessment_module,
                    })}
              </h6>
            `
          : ''}
        <a
          class="dropdown-item ${isActive ? 'active' : ''} d-flex align-items-center gap-3"
          aria-current="${isActive ? 'page' : ''}"
          aria-label="${assessmentDropdownItemData.title}"
          href="${plainUrlPrefix}/course_instance/${courseInstanceId}/instructor/assessment/${assessmentDropdownItemData.id}/${targetSubPage ??
          ''}"
        >
          <div class="d-flex align-items-center" style="width: 50px; min-width: 50px;">
            <span class="badge color-${assessmentDropdownItemData.assessment_set.color} mb-auto">
              ${assessmentDropdownItemData.label}
            </span>
          </div>
          <div>
            <p class="m-0 text-wrap">
              <span>${assessmentDropdownItemData.title}</span>
              ${assessmentDropdownItemData.group_work
                ? html` <i class="fas fa-users" aria-hidden="true"></i> `
                : ''}
              ${assessmentDropdownItemData.open_issue_count > 0
                ? html`
                    <span class="badge rounded-pill text-bg-danger">
                      ${assessmentDropdownItemData.open_issue_count}
                    </span>
                  `
                : ''}
            </p>
            <p class="m-0 ${isActive ? 'text-light' : 'text-muted'} small">
              ${assessmentDropdownItemData.tid}
            </p>
          </div>
        </a>
      `;
    })}
  `.toString();
}
