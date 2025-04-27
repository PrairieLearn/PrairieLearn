import { html } from '@prairielearn/html';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.html.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.html.js';
import { IssueBadge } from '../../components/IssueBadge.html.js';
import type { NavSubPage } from '../../components/Navbar.types.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';
import type { AssessmentRow } from '../../lib/assessment.js';
import { idsEqual } from '../../lib/id.js';

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
    return html` <p class="m-0">No assessments</p> `.toString();
  }

  return html`
    <div class="table-responsive">
      <table class="table table-borderless table-sm table-hover" aria-label="Assessments">
        <tbody>
          <thead>
            <th style="width: 1%"><span class="visually-hidden">Label</span></th>
            <th><span class="visually-hidden">Title</span></th>
            <th><span class="visually-hidden">AID</span></th>
          </thead>
          ${assessmentRows.map((row) => {
            const assessmentUrl = `${plainUrlPrefix}/course_instance/${courseInstanceId}/instructor/assessment/${row.id}/${targetSubPage ?? ''}`;

            const isActive = currentAssessmentId ? idsEqual(currentAssessmentId, row.id) : false;

            return html`
              ${row.start_new_assessment_group
                ? html`
                    <tr>
                      <th colspan="3" scope="row">
                        ${assessmentsGroupBy === 'Set'
                          ? AssessmentSetHeading({ assessment_set: row.assessment_set })
                          : AssessmentModuleHeading({
                              assessment_module: row.assessment_module,
                            })}
                      </th>
                    </tr>
                  `
                : ''}

              <tr
                id="row-${row.id}"
                class="${isActive ? 'text-white' : ''}"
                style="cursor: pointer;"
                onclick="window.location.href = '${assessmentUrl}'"
                aria-label="Link to assessment"
              >
                <td class="align-middle ${isActive ? 'bg-primary' : ''}" style="width: 1%">
                  <span class="badge color-${row.assessment_set.color}"> ${row.label} </span>
                </td>
                <td class="align-middle ${isActive ? 'bg-primary' : ''}">
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
                  <span class="${isActive ? 'text-white' : ''}">
                    ${row.title}
                    ${row.group_work ? html` <i class="fas fa-users" aria-hidden="true"></i> ` : ''}
                  </span>
                  ${IssueBadge({
                    count: row.open_issue_count,
                    urlPrefix: plainUrlPrefix,
                    issueAid: row.tid,
                  })}
                </td>
                <td class="align-middle ${isActive ? 'text-white bg-primary' : ''}">
                  <span>${row.tid}</span>
                </td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    </div>
  `.toString();
}
