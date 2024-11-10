import { html } from '@prairielearn/html';
import { formatPoints } from '../../src/lib/format.js';

export function Scorebar(
  scorePerc: number | null,
  {
    minWidth = '5em',
    maxWidth = '20em',
    classes = '',
  }: { minWidth?: string; maxWidth?: string; classes?: string } = {},
) {
  if (scorePerc == null) return '';

  const scorePercString = `${formatPoints(scorePerc)}%`;

  return html`
    <div
      class="progress border border-success ${classes}"
      style="min-width: ${minWidth}; max-width: ${maxWidth};"
    >
      <div class="progress-bar bg-success" style="width: ${Math.floor(Math.min(100, scorePerc))}%">
        ${scorePerc >= 50 ? scorePercString : ''}
      </div>
      <div
        class="d-flex flex-column justify-content-center text-center"
        style="width: ${100 - Math.floor(Math.min(100, scorePerc))}%"
      >
        ${scorePerc >= 50 ? '' : scorePercString}
      </div>
    </div>
  `;
}
