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

export const AssessmentDropdownRowSchema = AssessmentSchema.extend({
  label: z.string(),
  start_new_assessment_group: z.boolean(),
  assessment_set: AssessmentSetSchema,
  assessment_module: AssessmentModuleSchema,
  open_issue_count: z.coerce.number(),
});

type AssessmentDropdownRow = z.infer<typeof AssessmentDropdownRowSchema>;

export function AssessmentSwitcher({
  assessmentDropdownRows,
  selectedAssessmentId,
  assessmentsGroupBy,
  urlPrefix,
  targetSubPage,
}: {
  assessmentDropdownRows: AssessmentDropdownRow[];
  selectedAssessmentId: string;
  assessmentsGroupBy: 'Set' | 'Module';
  urlPrefix: string;
  targetSubPage?: NavSubPage;
}) {
  return html`
    ${assessmentDropdownRows.map(
      (row) => html`
        ${row.start_new_assessment_group
          ? html`
              <h6 class="dropdown-header">
                ${assessmentsGroupBy === 'Set'
                  ? AssessmentSetHeading({ assessment_set: row.assessment_set })
                  : AssessmentModuleHeading({
                      assessment_module: row.assessment_module,
                    })}
              </h6>
            `
          : ''}
        <a
          class="dropdown-item ${idsEqual(selectedAssessmentId, row.id)
            ? 'active'
            : ''} d-flex align-items-center gap-3"
          aria-current="${idsEqual(selectedAssessmentId, row.id) ? 'page' : ''}"
          aria-label="${row.title}"
          href="${urlPrefix}/assessment/${row.id}/${targetSubPage ?? ''}"
        >
          <div class="d-flex align-items-center" style="width: 50px; min-width: 50px;">
            <span class="badge color-${row.assessment_set.color} mb-auto"> ${row.label} </span>
          </div>
          <p class="m-0 text-wrap">
            ${row.title}
            ${row.group_work ? html` <i class="fas fa-users" aria-hidden="true"></i> ` : ''}
          </p>
          ${row.open_issue_count > 0
            ? html` <div class="badge rounded-pill text-bg-danger">${row.open_issue_count}</div> `
            : ''}
        </a>
      `,
    )}
  `.toString();
}
