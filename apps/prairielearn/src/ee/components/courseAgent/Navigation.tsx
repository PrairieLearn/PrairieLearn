import type { UIMessage } from 'ai';

import { type NavigationPart, NavigationPartSchema } from '@prairielearn/course-agent-types';

export function navigationOf(part: UIMessage['parts'][number]) {
  if (part.type !== 'data-navigation') return null;
  return NavigationPartSchema.safeParse(part.data).data ?? null;
}

/** What the page belongs to, most specific first: its kind, and the names course files use. */
function describeSubject({ courseInstance, assessment, question }: NavigationPart['target']) {
  if (question) return { kind: 'Question', names: [question] };
  if (assessment) return { kind: 'Assessment', names: [courseInstance, assessment] };
  if (courseInstance) return { kind: 'Course instance', names: [courseInstance] };
  return { kind: 'Course', names: [] };
}

/**
 * A page the agent offered to open. The page changes only when the instructor follows the link, so
 * the agent cannot discard their unsaved work or send them somewhere they did not choose.
 */
export function NavigationCard({ navigation }: { navigation: NavigationPart }) {
  const { kind, names } = describeSubject(navigation.target);
  const path = names.filter(Boolean).join(' / ');
  return (
    <a
      href={navigation.url}
      className="course-agent-page-link border rounded p-2 d-flex align-items-center gap-2 text-body text-decoration-none"
      aria-label={`Open ${navigation.label}${path ? ` (${kind.toLowerCase()} ${path})` : ''}`}
    >
      <span className="course-agent-page-link-icon rounded d-flex align-items-center justify-content-center flex-shrink-0">
        <i className="bi bi-window" aria-hidden="true" />
      </span>
      <span className="course-agent-page-link-text d-flex flex-column flex-grow-1">
        <span className="fw-semibold text-truncate">{navigation.label}</span>
        <span className="small text-muted text-truncate">
          {kind}
          {path && (
            <>
              {' · '}
              <span className="font-monospace">{path}</span>
            </>
          )}
        </span>
      </span>
      <i className="bi bi-arrow-right text-primary flex-shrink-0" aria-hidden="true" />
    </a>
  );
}
