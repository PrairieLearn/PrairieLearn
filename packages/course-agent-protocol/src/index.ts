import { z } from 'zod';

export const ConversationStatusSchema = z.enum([
  'offline',
  'starting',
  'waiting_for_agent',
  'waiting_for_user',
  'stopping',
  'blocked',
]);
export const MessagePartSchema = z.object({
  type: z.enum(['text', 'reasoning']),
  text: z.string(),
  state: z.enum(['streaming', 'done']),
});
export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  parts: z.array(MessagePartSchema),
});
export type Message = z.infer<typeof MessageSchema>;
export type MessagePart = z.infer<typeof MessagePartSchema>;

export const SummarySchema = z.object({
  revision: z.number().int().nonnegative(),
  status: ConversationStatusSchema,
  activeTurnId: z.uuid().nullable(),
  latestAssistantMessageId: z.string().nullable(),
  error: z.string().nullable(),
  capabilities: z.object({ send: z.boolean(), stop: z.boolean(), resume: z.boolean() }),
});
export type Summary = z.infer<typeof SummarySchema>;
export const SnapshotSchema = z.object({
  summary: SummarySchema,
  messages: z.array(MessageSchema).max(100),
  hasMore: z.boolean(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const EventSchema = z.discriminatedUnion('event', [
  z.object({
    type: z.literal('event'),
    event: z.literal('conversation.snapshot'),
    data: SnapshotSchema,
  }),
  z.object({
    type: z.literal('event'),
    event: z.literal('conversation.status_changed'),
    data: SummarySchema,
  }),
  z.object({
    type: z.literal('event'),
    event: z.literal('message.delta'),
    data: z.object({
      turnId: z.uuid(),
      messageId: z.string(),
      partIndex: z.number().int().nonnegative(),
      text: z.string(),
    }),
  }),
  z.object({
    type: z.literal('event'),
    event: z.literal('message.part_updated'),
    data: z.object({
      turnId: z.uuid(),
      messageId: z.string(),
      partIndex: z.number().int().nonnegative(),
      part: MessagePartSchema,
    }),
  }),
  z.object({
    type: z.literal('event'),
    event: z.literal('message.completed'),
    data: MessageSchema,
  }),
  z.object({
    type: z.literal('event'),
    event: z.literal('turn.finished'),
    data: z.object({
      turnId: z.uuid(),
      outcome: z.enum(['completed', 'cancelled', 'failed', 'interrupted']),
      error: z.string().nullable(),
    }),
  }),
]);
export type ConversationEvent = z.infer<typeof EventSchema>;
export const CourseContextSchema = z.object({
  courseTitle: z.string().max(1000),
  courseShortName: z.string().max(1000),
});
export type CourseContext = z.infer<typeof CourseContextSchema>;

export const CommandSchema = z
  .object({
    type: z.literal('command'),
    ref: z.string().max(100),
  })
  .and(
    z.discriminatedUnion('method', [
      z.object({
        method: z.literal('conversation.subscribe'),
        params: z.object({ mode: z.enum(['full', 'summary']).default('full') }),
      }),
      z.object({
        method: z.literal('turn.start'),
        params: z.object({
          text: z.string().trim().min(1).max(20_000),
          context: CourseContextSchema,
        }),
      }),
      z.object({ method: z.literal('turn.stop'), params: z.object({ turnId: z.uuid() }) }),
      z.object({ method: z.literal('conversation.resume'), params: z.object({}) }),
    ]),
  );
export type Command = z.infer<typeof CommandSchema>;
export const CommandResultSchema = z.object({
  type: z.literal('result'),
  ref: z.string(),
  result: z.object({ turnId: z.uuid().optional(), messageId: z.string().optional() }),
});
export const CommandErrorSchema = z.object({
  type: z.literal('error'),
  ref: z.string(),
  code: z.number().int(),
  message: z.string(),
});
export const ServerFrameSchema = z.union([EventSchema, CommandResultSchema, CommandErrorSchema]);
export type ServerFrame = z.infer<typeof ServerFrameSchema>;
