import { html } from '@prairielearn/html';
import type { AssessmentSet } from '../lib/db-types.js';

export function MissingDefinition({ item }) {
  return html`<span class="text-muted">
    (Auto-generated from use in an assessment; add this assessment ${item.toLowerCase()} to your
    infoCourse.json file to customize)</span>
  `;
}

export function AssessmentSetHeading({
  assessment_set,
 }: {
  assessment_set: AssessmentSet
 }) {
  return html`
      <tr>
        <td class="align-middle">${assessment_set.number}</td>
        <td class="align-middle">
          <span class="badge color-${assessment_set.color}">
            ${assessment_set.abbreviation}
          </span>
        </td>
        <td class="align-middle">${assessment_set.name}</td>
        <td class="align-middle">
          ${assessment_set.heading}
          ${assessment_set.implicit && MissingDefinition({ item: 'Set' })}
        </td>
        <td class="align-middle">${assessment_set.color}</td>
      </tr>
  `;
}
