import { html } from '@prairielearn/html';

export function Scorebar(
  score: number | null,
  {
    minWidth = '5em',
    maxWidth = '20em',
    classes = '',
  }: { minWidth?: string; maxWidth?: string; classes?: string } = {},
) {
  if (score == null) return '';
  return html`
    <div
      class="progress border border-success ${classes}"
      style="min-width: ${minWidth}; max-width: ${maxWidth};"
    >
      <div class="progress-bar bg-success" style="width: ${Math.floor(Math.min(100, score))}%">
        ${score >= 50 ? `${Math.floor(score)}%` : ''}
      </div>
      <div
        class="d-flex flex-column justify-content-center text-center"
        style="width: ${100 - Math.floor(Math.min(100, score))}%"
      >
        ${score >= 50 ? '' : `${Math.floor(score)}%`}
      </div>
    </div>
  `;
}
