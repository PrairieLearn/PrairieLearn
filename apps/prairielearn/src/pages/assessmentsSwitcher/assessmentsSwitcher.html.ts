import { z } from 'zod';

import { html } from '@prairielearn/html';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.html.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.html.js';
import type { NavSubPage } from '../../components/Navbar.types.js';
import {
  AssessmentModuleSchema,
  AssessmentSchema,
  AssessmentSetSchema,
} from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';

export const AssessmentDropdownItemDataSchema = AssessmentSchema.extend({
  label: z.string(),
  start_new_assessment_group: z.boolean(),
  assessment_set: AssessmentSetSchema,
  assessment_module: AssessmentModuleSchema,
  open_issue_count: z.coerce.number(),
});

type AssessmentDropdownItemData = z.infer<typeof AssessmentDropdownItemDataSchema>;

export function AssessmentSwitcher({
  assessmentDropdownItemsData,
  selectedAssessmentId,
  assessmentsGroupBy,
  plainUrlPrefix,
  courseInstanceId,
  targetSubPage,
}: {
  assessmentDropdownItemsData: AssessmentDropdownItemData[];
  selectedAssessmentId: string;
  assessmentsGroupBy: 'Set' | 'Module';
  plainUrlPrefix: string;
  courseInstanceId: string;
  /* The subPage that assessment links should start on. */
  targetSubPage?: NavSubPage;
}) {
  return html`
    ${assessmentDropdownItemsData.map(
      (assessmentDropdownItemData) => html`
        ${assessmentDropdownItemData.start_new_assessment_group
          ? html`
              <h6 class="dropdown-header">
                ${assessmentsGroupBy === 'Set'
                  ? AssessmentSetHeading({ assessment_set: assessmentDropdownItemData.assessment_set })
                  : AssessmentModuleHeading({
                      assessment_module: assessmentDropdownItemData.assessment_module,
                    })}
              </h6>
            `
          : ''}
        <a
          class="dropdown-item ${idsEqual(selectedAssessmentId, assessmentDropdownItemData.id)
            ? 'active'
            : ''} d-flex align-items-center gap-3"
          aria-current="${idsEqual(selectedAssessmentId, assessmentDropdownItemData.id) ? 'page' : ''}"
          aria-label="${assessmentDropdownItemData.title}"
          href="${plainUrlPrefix}/course_instance/${courseInstanceId}/instructor/assessment/${assessmentDropdownItemData.id}/${targetSubPage ?? ''}"
        >
          <div class="d-flex align-items-center" style="width: 50px; min-width: 50px;">
            <span class="badge color-${assessmentDropdownItemData.assessment_set.color} mb-auto"> ${assessmentDropdownItemData.label} </span>
          </div>
          <p class="m-0 text-wrap">
            ${assessmentDropdownItemData.title}
            ${assessmentDropdownItemData.group_work ? html` <i class="fas fa-users" aria-hidden="true"></i> ` : ''}
          </p>
          ${assessmentDropdownItemData.open_issue_count > 0
            ? html` <div class="badge rounded-pill text-bg-danger">${assessmentDropdownItemData.open_issue_count}</div> `
            : ''}
        </a>
      `,
    )}
  `.toString();
}
