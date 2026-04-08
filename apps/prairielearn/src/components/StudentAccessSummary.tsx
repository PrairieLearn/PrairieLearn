import { escapeHtml, html } from '@prairielearn/html';

import type {
  AccessDisplayBadge,
  AccessDisplayModel,
} from '../lib/assessment-access-control/access-display.js';

function badgeClassName(tone: AccessDisplayBadge['tone']) {
  switch (tone) {
    case 'success':
      return 'text-bg-success';
    case 'warning':
      return 'text-bg-warning';
    case 'danger':
      return 'text-bg-danger';
    case 'info':
      return 'text-bg-info';
    case 'secondary':
      return 'text-bg-light border';
  }
}

function AccessSummaryBody({ model }: { model: AccessDisplayModel }) {
  return html`
    <div style="max-width: 34rem">
      <div class="d-flex flex-wrap gap-2 mb-3">
        ${model.badges.map(
          (badge) => html`
            <span class="badge rounded-pill ${badgeClassName(badge.tone)}">
              ${badge.icon ? html`<i class="bi bi-${badge.icon} me-1" aria-hidden="true"></i>` : ''}
              ${badge.label}
            </span>
          `,
        )}
      </div>
      ${model.rows.length > 0
        ? html`
            <div class="table-responsive">
              <table class="table table-sm mb-0" aria-label="Access details">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Credit</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${model.rows.map(
                    (row) => html`
                      <tr>
                        <td>
                          ${row.label ? html`<span class="text-muted">${row.label}:</span> ` : ''}
                          ${row.dateText}
                        </td>
                        <td>${row.creditText ?? '—'}</td>
                        <td>${row.detailsText}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
        : html`<p class="text-muted mb-0">No detailed access dates are configured.</p>`}
    </div>
  `;
}

export function StudentAccessSummaryPopover({
  model,
  label = 'Access details',
}: {
  model: AccessDisplayModel | null | undefined;
  label?: string;
}) {
  if (!model) return '';

  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost px-1 py-0 align-baseline"
      aria-label="${label}"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="${label}"
      data-bs-content="${escapeHtml(AccessSummaryBody({ model }))}"
    >
      <i class="bi bi-info-circle" aria-hidden="true"></i>
    </button>
  `;
}

export function StudentAccessSummaryInline({
  model,
  title = 'Access details',
  className = '',
}: {
  model: AccessDisplayModel | null | undefined;
  title?: string;
  className?: string;
}) {
  if (!model) return '';

  return html`
    <section class="card border-secondary-subtle ${className}">
      <div class="card-header bg-light">
        <strong>${title}</strong>
      </div>
      <div class="card-body py-3">${AccessSummaryBody({ model })}</div>
    </section>
  `;
}
