import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useState } from 'react';
import { Spinner } from 'react-bootstrap';

import { type NavigationPart, NavigationPartSchema } from '@prairielearn/course-agent-types';
import { getAppError } from '@prairielearn/trpc/client';

import { useTRPC } from '../../../trpc/course/context.js';

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
 * A page the agent offered to open. The page changes only when the instructor clicks, so the
 * agent cannot discard their unsaved work or send them somewhere they did not choose.
 */
export function NavigationButton({ navigation }: { navigation: NavigationPart }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { kind, names } = describeSubject(navigation.target);
  const path = names.filter(Boolean).join(' / ');
  const description = `${navigation.label}${path ? ` (${kind.toLowerCase()} ${path})` : ''}`;

  const open = () => {
    if (opening) return;
    setOpening(true);
    setError(null);
    queryClient
      .query({
        ...trpc.courseAgent.resolveNavigation.queryOptions(navigation.target),
        staleTime: 0,
      })
      .then(
        ({ url }) => {
          window.location.assign(url);
          // A page restored from the back-forward cache keeps this state, so leave the card usable.
          setOpening(false);
        },
        (error: unknown) => {
          setOpening(false);
          setError(getAppError(error)?.message ?? '');
        },
      );
  };

  return (
    <div>
      {/* aria-disabled keeps keyboard focus on the card while the page is looked up. */}
      <button
        type="button"
        className="course-agent-page-link border rounded p-2 w-100 d-flex align-items-center gap-2 text-start text-body"
        aria-label={`Open ${description}`}
        aria-disabled={opening}
        onClick={open}
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
        {opening ? (
          <Spinner animation="border" size="sm" className="text-primary flex-shrink-0" />
        ) : (
          <i className="bi bi-arrow-right text-primary flex-shrink-0" aria-hidden="true" />
        )}
      </button>
      {error !== null && (
        <div className="small text-danger mt-1" role="alert">
          Could not open {description}.{error && ` ${error}`}
        </div>
      )}
    </div>
  );
}
