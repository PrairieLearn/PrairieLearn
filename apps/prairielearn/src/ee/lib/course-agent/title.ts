import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { requestCourseAgentConversationTitle } from './client.js';

const MAX_PROMPT_TITLE_LENGTH = 80;
// The model is asked for well under this, so the cap is only a backstop.
const MAX_GENERATED_TITLE_LENGTH = 50;

/** Collapses whitespace and truncates by code point so emoji are never split. */
export function formatCourseAgentConversationTitle(text: string, maxLength: number) {
  const codePoints = [...text.replaceAll(/\s+/g, ' ').trim()];
  if (codePoints.length <= maxLength) return codePoints.join('');
  return `${codePoints.slice(0, maxLength - 3).join('')}...`;
}

/**
 * Summarizes the first prompt of a conversation into a short title. Falls back
 * to the truncated prompt when the request fails, since a missing title should
 * never block starting a conversation.
 */
export async function generateCourseAgentConversationTitle(prompt: string): Promise<string> {
  try {
    const title = formatCourseAgentConversationTitle(
      (await requestCourseAgentConversationTitle(prompt)).replaceAll(/^["']|["']$/g, ''),
      MAX_GENERATED_TITLE_LENGTH,
    );
    if (title) return title;
  } catch (err) {
    logger.error('Error generating course agent conversation title', err);
    Sentry.captureException(err);
  }
  return formatCourseAgentConversationTitle(prompt, MAX_PROMPT_TITLE_LENGTH);
}
