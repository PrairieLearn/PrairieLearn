import { z } from 'zod';

/** What a conversation needs to call PrairieLearn's API on its user's behalf. */
export interface PrairieLearnContext {
  plUrl: string;
  serviceToken: string;
  conversationId: string;
  courseId: string | undefined;
}

/**
 * PrairieLearn identifies the user and course from the conversation, so the model never chooses
 * whose permissions apply.
 */
export function authHeaders({ serviceToken, conversationId }: PrairieLearnContext) {
  return {
    Authorization: `Bearer ${serviceToken}`,
    'X-Course-Agent-Conversation': conversationId,
  };
}

export async function errorMessage(response: Response) {
  const body = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {
    // A proxy or load balancer error page, not an API response.
  }
  const parsed = z.object({ message: z.string() }).safeParse(json);
  return parsed.success ? parsed.data.message : response.statusText;
}
