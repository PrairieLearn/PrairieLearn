import { html } from '@prairielearn/html';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.html.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.html.js';
import type { NavSubPage } from '../../components/Navbar.types.js';
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
    return html`
      <button class="dropdown-item disabled" disabled>No assessments</button>
    `.toString();
  }

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
