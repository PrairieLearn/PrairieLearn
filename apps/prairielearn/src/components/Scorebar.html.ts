import { html } from '@prairielearn/html';

export function Scorebar(
  score: number | null,
  {
    minWidth = '5em',
    maxWidth = '20em',
    label,
  }: { minWidth?: string; maxWidth?: string; label?: string } = {},
) {
  if (score == null) return '';

  const resolvedLabel = label ?? `${Math.floor(score)}%`;

  return html`
    <div class="progress bg" style="min-width: ${minWidth}; max-width: ${maxWidth};">
      <div class="progress-bar bg-success" style="width: ${Math.floor(Math.min(100, score))}%">
        ${score >= 50 ? resolvedLabel : ''}
      </div>
      <div class="progress-bar bg-danger" style="width: ${100 - Math.floor(Math.min(100, score))}%">
        ${score >= 50 ? '' : resolvedLabel}
      </div>
    </div>
  `;
}
