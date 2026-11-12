import type { UIMessage } from 'ai';
import { useEffect } from 'react';
import { z } from 'zod';

import { type NavigationPart, NavigationPartSchema } from '@prairielearn/course-agent-types';

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
  // Changing pages is a browser side effect of a part streaming in; history never replays it.
  useEffect(() => {
    if (!live || !message) return;
    for (const part of message.parts) {
      const found = navigationOf(part);
      if (found && claim(found.id)) {
        window.location.assign(found.navigation.url);
        // Anything after a page change belongs to the next page load.
        return;
      }
    }
  });
}

function describeTarget({ target, label }: NavigationPart) {
  const subject =
    target.file ??
    (target.assessment
      ? `assessment ${target.assessment}`
      : target.question
        ? `question ${target.question}`
        : target.courseInstance
          ? `course instance ${target.courseInstance}`
          : null);
  return subject ? `${label} (${subject})` : label;
}

export function NavigationNotice({ navigation }: { navigation: NavigationPart }) {
  return (
    <div className="small text-muted d-flex align-items-center gap-1">
      <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
      Opened <a href={navigation.url}>{describeTarget(navigation)}</a>
    </div>
  );
}
