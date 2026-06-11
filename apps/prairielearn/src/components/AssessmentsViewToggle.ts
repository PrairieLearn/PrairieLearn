import { html } from '@prairielearn/html';

function viewHref(search: string, view: 'list' | 'calendar') {
  const params = new URLSearchParams(search);
  params.set('view', view);
  return `?${params.toString()}`;
}

/**
 * List/calendar view switcher for the assessments pages. Server-rendered
 * links: switching views reloads the page with the chosen `?view`, preserving
 * the rest of the query string (e.g. the calendar's `month`).
 */
export function AssessmentsViewToggle({
  view,
  search,
}: {
  view: 'list' | 'calendar';
  search: string;
}) {
  return html`
    <div class="btn-group btn-group-sm ms-3" role="group" aria-label="Assessments view">
      <a
        class="btn btn-light ${view === 'list' ? 'active' : ''}"
        href="${viewHref(search, 'list')}"
        ${view === 'list' ? html`aria-current="page"` : ''}
      >
        <i class="bi bi-list-ul" aria-hidden="true"></i>
        <span class="d-none d-sm-inline">List</span>
      </a>
      <a
        class="btn btn-light ${view === 'calendar' ? 'active' : ''}"
        href="${viewHref(search, 'calendar')}"
        ${view === 'calendar' ? html`aria-current="page"` : ''}
      >
        <i class="bi bi-calendar3" aria-hidden="true"></i>
        <span class="d-none d-sm-inline">Calendar</span>
      </a>
    </div>
  `;
}
