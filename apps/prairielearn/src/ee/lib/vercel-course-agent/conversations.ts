import { randomUUID } from 'node:crypto';

import type { HarnessAgentResumeSessionState } from '@ai-sdk/harness/agent';

import { HttpStatusError } from '@prairielearn/error';

import type { Course } from '../../../lib/db-types.js';

import { courseRepository } from './course-repository.js';
import { type createSandboxAgent, sandboxLifetimeMs } from './sandbox.js';

interface Owner {
  courseId: string;
  userId: string;
  authnUserId: string;
}
type Conversation = Owner & {
  id: string;
  repository: ReturnType<typeof courseRepository>;
  busy: boolean;
  failed: boolean;
  runtime?: Awaited<ReturnType<typeof createSandboxAgent>>;
  resumeFrom?: HarnessAgentResumeSessionState;
};

// Deliberately process-local: reloads, server changes, and expiry require starting over.
const conversations = new Map<string, Conversation>();

export function createConversation(owner: Owner, course: Pick<Course, 'repository' | 'branch'>) {
  const repository = courseRepository(course);
  const id = randomUUID();
  conversations.set(id, { ...owner, id, repository, busy: false, failed: false });
  // This only bounds host memory. Vercel owns sandbox expiry; there is no renewal loop.
  setTimeout(() => conversations.delete(id), sandboxLifetimeMs).unref();
  return { conversationId: id };
}

export function claimConversation(id: string, owner: Owner) {
  const conversation = conversations.get(id);
  if (
    conversation?.courseId !== owner.courseId ||
    conversation.userId !== owner.userId ||
    conversation.authnUserId !== owner.authnUserId
  ) {
    throw new HttpStatusError(404, 'Conversation unavailable. Start over.');
  }
  if (conversation.busy) throw new HttpStatusError(409, 'The agent is already responding.');
  if (conversation.failed) throw new HttpStatusError(409, 'Conversation interrupted. Start over.');
  // Claim synchronously, before any sandbox or model request can yield.
  conversation.busy = true;
  return conversation;
}
