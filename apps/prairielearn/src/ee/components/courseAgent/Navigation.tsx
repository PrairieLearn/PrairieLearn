import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import { z } from 'zod';

import {
  type NavigationPart,
  NavigationPartSchema,
  type NavigationTarget,
} from '@prairielearn/course-agent-types';
import { getAppError } from '@prairielearn/trpc/client';

import { useTRPC } from '../../../trpc/course/context.js';

const HANDLED_KEY = 'course-agent:navigation-handled';
const MAX_HANDLED = 100;

export function navigationOf(part: UIMessage['parts'][number]) {
  if (part.type !== 'data-navigation' || !('id' in part) || !part.id) return null;
  const data = NavigationPartSchema.safeParse(part.data).data;
  return data ? { id: part.id, navigation: data } : null;
}

function readHandled(): string[] {
  try {
    return z
      .array(z.string())
      .catch([])
      .parse(JSON.parse(sessionStorage.getItem(HANDLED_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

/**
 * Marks a part as acted on. Changing pages reconnects the chat, which replays the live reply
 * afterwards, so this record keeps the same part from acting again.
 */
function claim(id: string) {
  const handled = readHandled();
  if (handled.includes(id)) return false;
  sessionStorage.setItem(HANDLED_KEY, JSON.stringify([...handled, id].slice(-MAX_HANDLED)));
  return true;
}

/** Acts on navigation parts that arrive in the live reply, once each. */
export function useAgentNavigation({
  message,
  live,
}: {
  message: UIMessage | undefined;
  live: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const navigate = (id: string, navigation: NavigationPart) => {
    if (navigation.action === 'refresh') {
      window.location.reload();
      return;
    }
    queryClient
      .query({
        ...trpc.courseAgent.resolveNavigation.queryOptions(navigation.target),
        staleTime: 0,
      })
      .then(
        ({ url }) => window.location.assign(url),
        (error: unknown) => {
          const message = getAppError(error)?.message || 'Could not open the page.';
          setErrors((current) => ({ ...current, [id]: message }));
        },
      );
  };

  // Changing pages is a browser side effect of a part streaming in; history never replays it.
  useEffect(() => {
    if (!live || !message) return;
    for (const part of message.parts) {
      const found = navigationOf(part);
      if (found && claim(found.id)) {
        navigate(found.id, found.navigation);
        // Anything after a page change belongs to the next page load.
        return;
      }
    }
  });

  return { errors, navigate };
}

function describeTarget(target: NavigationTarget) {
  const subject = target.assessment
    ? `assessment ${target.assessment}`
    : target.question
      ? `question ${target.question}`
      : target.courseInstance
        ? `course instance ${target.courseInstance}`
        : 'course';
  return target.page ? `${subject} (${target.page.replaceAll('_', ' ')})` : subject;
}

export function NavigationNotice({
  navigation,
  error,
  onOpen,
}: {
  navigation: NavigationPart;
  error: string | undefined;
  onOpen: () => void;
}) {
  return (
    <div className="small text-muted d-flex align-items-center gap-1">
      <i
        className={
          navigation.action === 'refresh' ? 'bi bi-arrow-clockwise' : 'bi bi-box-arrow-up-right'
        }
        aria-hidden="true"
      />
      {navigation.action === 'refresh' ? (
        'Reloaded the page'
      ) : error ? (
        <span className="text-danger">
          Could not open {describeTarget(navigation.target)}. {error}
        </span>
      ) : (
        <>
          Opened
          <Button variant="link" size="sm" className="p-0 align-baseline" onClick={onOpen}>
            {describeTarget(navigation.target)}
          </Button>
        </>
      )}
    </div>
  );
}
