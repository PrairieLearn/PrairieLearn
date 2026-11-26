import { formatDate } from '@prairielearn/formatter';
import { escapeHtml, html } from '@prairielearn/html';

import type { AssessmentAuthzResult } from '../lib/assessment-access-control/authz-result.js';

interface Schedule {
  columns: string[];
  rows: { cells: string[]; current: boolean; past: boolean }[];
}

function buildSchedule({
  authzResult,
  modernAccessControl,
  displayTimezone,
}: {
  authzResult: AssessmentAuthzResult;
  modernAccessControl: boolean;
  displayTimezone: string;
}): Schedule {
  if (!modernAccessControl) {
    // Legacy access rules can overlap or leave gaps, so each row needs both
    // of its dates, and their order says nothing about which are in the past.
    return {
      columns: ['Credit', 'Start', 'End'],
      rows: authzResult.access_rules.map((rule) => ({
        cells: [rule.credit, rule.start_date, rule.end_date],
        current: rule.active === true,
        past: false,
      })),
    };
  }

  // Hide segments where submissions aren't allowed. Rendering a 0%-credit
  // after-last-deadline row reads as "keep submitting for 0 credit" when
  // submissions are actually forbidden. The resolver still emits these entries
  // so other consumers (e.g. instructor views) can show the full picture.
  const entries = authzResult.access_timeline.filter((entry) => entry.submittable);
  const currentIndex = entries.findIndex((entry) => entry.current);
  // Timeline segments are contiguous, so each one starts when the previous
  // one ends and only the end date needs to be shown.
  return {
    columns: ['Credit', 'Until'],
    rows: entries.map((entry, index) => ({
      cells: [`${entry.credit}%`, entry.endDate ? formatDate(entry.endDate, displayTimezone) : '—'],
      current: index === currentIndex,
      past: index < currentIndex,
    })),
  };
}

/**
 * Renders the credit currently available to a student. When the credit changes
 * over time, the text opens a popover that lists the full schedule.
 */
export function StudentAvailableCredit({
  authzResult,
  modernAccessControl,
  displayTimezone,
}: {
  authzResult: AssessmentAuthzResult;
  modernAccessControl: boolean;
  displayTimezone: string;
}) {
  const credit = authzResult.credit_date_string ?? 'None';
  const schedule = buildSchedule({ authzResult, modernAccessControl, displayTimezone });

  // A single-row schedule usually says nothing that the credit text doesn't
  // already say. The exception is when there is no credit, since the text then
  // omits the date that the row would show.
  const hasSchedule = schedule.rows.length > 1 || (schedule.rows.length === 1 && credit === 'None');
  if (!hasSchedule) return html`${credit}`;

  // The popover moves focus to the `autofocus` element when it opens. Focusing
  // the start of the content, rather than the close button, lets screen reader
  // users read straight into the table.
  const content = html`
    <div class="table-responsive" tabindex="-1" autofocus>
      <table class="table table-sm mb-0" aria-label="Credit schedule">
        <thead>
          <tr>
            ${schedule.columns.map((column) => html`<th scope="col">${column}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${schedule.rows.map(
            (row) => html`
              <tr class="${row.current ? 'table-primary fw-semibold' : ''}">
                ${row.cells.map(
                  (cell, index) => html`
                    <td class="${row.past ? 'text-muted' : ''}">
                      ${cell}
                      ${
                        row.current && index === 0
                          ? html`<span class="badge text-bg-primary ms-1">Now</span>`
                          : ''
                      }
                    </td>
                  `,
                )}
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;

  return html`
    <button
      type="button"
      class="btn btn-link link-body-emphasis p-0 align-baseline"
      style="text-decoration-style: dotted; text-underline-offset: 3px;"
      aria-label="${credit}, show credit schedule"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Credit schedule"
      data-bs-content="${escapeHtml(content)}"
      data-bs-custom-class="popover-wide"
      data-bs-placement="bottom"
    >
      ${credit}<i class="bi bi-chevron-down ms-1 small" aria-hidden="true"></i>
    </button>
  `;
}
