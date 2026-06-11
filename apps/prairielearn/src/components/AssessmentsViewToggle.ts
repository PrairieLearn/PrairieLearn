import { html } from '@prairielearn/html';

/**
 * List/calendar view switcher for the assessments pages. Server-rendered
 * links: switching views reloads the page with the chosen `?view`.
 */
export function AssessmentsViewToggle({ view }: { view: 'list' | 'calendar' }) {
  return html`
    <div class="btn-group btn-group-sm ms-3" role="group" aria-label="Assessments view">
      <a
        class="btn btn-light ${view === 'list' ? 'active' : ''}"
        href="?view=list"
        aria-current="${view === 'list' ? 'page' : 'false'}"
      >
        <i class="bi bi-list-ul" aria-hidden="true"></i>
        <span class="d-none d-sm-inline">List</span>
      </a>
      <a
        class="btn btn-light ${view === 'calendar' ? 'active' : ''}"
        href="?view=calendar"
        aria-current="${view === 'calendar' ? 'page' : 'false'}"
      >
        <i class="bi bi-calendar3" aria-hidden="true"></i>
        <span class="d-none d-sm-inline">Calendar</span>
      </a>
    </div>
  `;
}
