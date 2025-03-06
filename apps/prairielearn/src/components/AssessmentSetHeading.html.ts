import { html } from '@prairielearn/html';

export function MissingDefinition({ item }) {
  return html`<span class="text-muted">
    (Auto-generated from use in an assessment; add this assessment ${item.toLowerCase()} to your
    infoCourse.json file to customize)</span
  >`;
}
