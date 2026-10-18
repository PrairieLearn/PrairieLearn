import { z } from 'zod';

import { ConversationStatusSchema, CourseContextSchema } from '@prairielearn/course-agent-protocol';

export const ChatStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    status: ConversationStatusSchema,
    execution: z
      .object({ turnId: z.uuid(), messageId: z.uuid(), assistantMessageId: z.uuid() })
      .nullable(),
    latestAssistantMessageId: z.string().nullable(),
    error: z.string().nullable(),
    courseContext: CourseContextSchema.nullable(),
  })
  .superRefine((state, ctx) => {
    const active = ['starting', 'waiting_for_agent', 'stopping'].includes(state.status);
    if (active && !state.execution) {
      ctx.addIssue({ code: 'custom', message: 'Active work needs an execution' });
    }
    if (['offline', 'waiting_for_user'].includes(state.status) && state.execution) {
      ctx.addIssue({ code: 'custom', message: 'An idle conversation cannot have an execution' });
    }
    if ((state.status === 'blocked') !== (state.error !== null)) {
      ctx.addIssue({ code: 'custom', message: 'Only blocked conversations have an error' });
    }
  });
export type ChatState = z.infer<typeof ChatStateSchema>;
export const INITIAL_STATE: ChatState = {
  schemaVersion: 1,
  revision: 0,
  status: 'offline',
  execution: null,
  latestAssistantMessageId: null,
  error: null,
  courseContext: null,
};

const LegacyStateSchema = z.object({ courseContext: CourseContextSchema.nullable() }).strict();

/** The previous implementation stored only prompt context, with no durable execution status. */
export function migrateChatState(stored: unknown): { state: ChatState; migrated: boolean } {
  const current = ChatStateSchema.safeParse(stored);
  if (current.success) return { state: current.data, migrated: false };
  const legacy = LegacyStateSchema.safeParse(stored);
  if (!legacy.success) throw current.error;
  return {
    migrated: true,
    state: ChatStateSchema.parse({
      ...INITIAL_STATE,
      courseContext: legacy.data.courseContext,
      status: 'blocked',
      error: 'Please resume this conversation before sending another message.',
    }),
  };
}
