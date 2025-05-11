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
    <div id="assessment-switcher-container">
      ${assessmentRows.map((row, index) => {
        const assessmentUrl = `${plainUrlPrefix}/course_instance/${courseInstanceId}/instructor/assessment/${row.id}/${targetSubPage ?? ''}`;

        const isActive = currentAssessmentId ? idsEqual(currentAssessmentId, row.id) : false;

        return html`
          ${row.start_new_assessment_group
            ? html`
                <div class="assessment-heading ${index === 0 ? 'first' : ''}">
                  ${assessmentsGroupBy === 'Set'
                    ? AssessmentSetHeading({ assessment_set: row.assessment_set })
                    : AssessmentModuleHeading({
                        assessment_module: row.assessment_module,
                      })}
                </div>
              `
            : ''}
          <div class="assessment-row ${isActive ? 'selected' : ''}">
            <div class="label">
              <span class="badge color-${row.assessment_set.color}"> ${row.label} </span>
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
              <a href="${assessmentUrl}">
                ${row.title}
                ${row.group_work ? html` <i class="fas fa-users" aria-hidden="true"></i> ` : ''}
              </a>
              ${IssueBadge({
                count: row.open_issue_count,
                urlPrefix: plainUrlPrefix,
                issueAid: row.tid,
              })}
            </div>
            <div class="tid ${isActive ? '' : 'text-muted'}">${row.tid}</div>
          </div>
        `;
      })}
    </div>
  `.toString();
}
