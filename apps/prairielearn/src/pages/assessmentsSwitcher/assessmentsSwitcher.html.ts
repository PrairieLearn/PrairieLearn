import { html } from '@prairielearn/html';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.html.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.html.js';
import { IssueBadge } from '../../components/IssueBadge.html.js';
import type { NavSubPage } from '../../components/Navbar.types.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';
import { idsEqual } from '../../lib/id.js';
import type { AssessmentRow } from '../../models/assessment.js';

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
  currentAssessmentId: string;
  courseInstanceId: string;
  plainUrlPrefix: string;
  /* The subPage that assessment links should redirect to. */
  targetSubPage?: NavSubPage;
}) {
  return html`
    <div id="assessment-switcher-container" class="d-flex flex-column">
      ${assessmentRows.map((row, index) => {
        const assessmentUrl = `${plainUrlPrefix}/course_instance/${courseInstanceId}/instructor/assessment/${row.id}/${targetSubPage ?? ''}`;

        const isActive = idsEqual(currentAssessmentId, row.id);

        return html`
          ${row.start_new_assessment_group
            ? html`
                <div class="fw-bold ${index === 0 ? 'mt-0' : 'mt-3'}">
                  ${assessmentsGroupBy === 'Set'
                    ? AssessmentSetHeading({ assessment_set: row.assessment_set })
                    : AssessmentModuleHeading({
                        assessment_module: row.assessment_module,
                      })}
                </div>
              `
            : ''}
          <div
            class="assessment-row column-gap-2 p-2 mt-1 gap-md-1 p-md-1 w-100 rounded ${isActive
              ? 'bg-primary text-white'
              : ''}"
          >
            <div class="d-flex align-items-center">
              <span
                class="badge overflow-hidden text-truncate text-nowrap color-${row.assessment_set
                  .color}"
              >
                ${row.label}
              </span>
            </div>
            <div class="title">
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
              <a href="${assessmentUrl}" class="${isActive ? 'text-white' : ''}">
                ${row.title}
                ${row.group_work ? html` <i class="fas fa-users" aria-hidden="true"></i> ` : ''}
              </a>
              ${IssueBadge({
                count: row.open_issue_count,
                urlPrefix: plainUrlPrefix,
                issueAid: row.tid,
              })}
            </div>
            <div class="d-flex overflow-hidden align-items-center ${isActive ? '' : 'text-muted'}">
              <!-- Use RTL so the overflow is on the left, but with an inner span with auto direction so it doesn't affect the text itself -->
              <span class="text-nowrap text-truncate text-start" dir="rtl">
                <span dir="auto">${row.tid}</span>
              </span>
            </div>
          </div>
        `;
      })}
    </div>
  `.toString();
}
