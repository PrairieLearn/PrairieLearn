import type { UIMessage } from 'ai';

import { type NavigationPart, NavigationPartSchema } from '@prairielearn/course-agent-types';

export function navigationOf(part: UIMessage['parts'][number]) {
  if (part.type !== 'data-navigation') return null;
  return NavigationPartSchema.safeParse(part.data).data ?? null;
}

/**
 * A page the agent offered to open. The page changes only when the instructor follows the link, so
 * the agent cannot discard their unsaved work or send them somewhere they did not choose.
 */
export function NavigationCard({ navigation }: { navigation: NavigationPart }) {
  return (
    <a
      href={navigation.url}
      className="course-agent-page-link border rounded p-2 d-flex align-items-center gap-2 text-body text-decoration-none"
      aria-label={`Open ${navigation.label} (${navigation.subtitle})`}
    >
      <span className="course-agent-page-link-icon rounded d-flex align-items-center justify-content-center flex-shrink-0">
        <i className="bi bi-window" aria-hidden="true" />
      </span>
      <span className="course-agent-page-link-text d-flex flex-column flex-grow-1">
        <span className="fw-semibold text-truncate">{navigation.label}</span>
        <span className="small text-muted text-truncate">{navigation.subtitle}</span>
      </span>
      <i className="bi bi-arrow-right text-primary flex-shrink-0" aria-hidden="true" />
    </a>
  );
}

export function isReloadPart(part: UIMessage['parts'][number]) {
  return part.type === 'data-reload';
}

/** A reload the agent offered, so the page shows saved changes. Like a page, it waits for a click. */
export function ReloadCard() {
  return (
    <button
      type="button"
      className="course-agent-page-link border rounded p-2 d-flex align-items-center gap-2 text-body text-start w-100"
      onClick={() => window.location.reload()}
    >
      <span className="course-agent-page-link-icon rounded d-flex align-items-center justify-content-center flex-shrink-0">
        <i className="bi bi-arrow-clockwise" aria-hidden="true" />
      </span>
      <span className="course-agent-page-link-text d-flex flex-column flex-grow-1">
        <span className="fw-semibold text-truncate">Reload this page</span>
        <span className="small text-muted text-truncate">Shows the latest saved changes</span>
      </span>
    </button>
  );
}
