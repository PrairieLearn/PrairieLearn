import { readUIMessageStream } from 'ai';

import { CourseAgentEventSchema } from '@prairielearn/course-agent-protocol';

import type { selectCourseAgentHistory } from '../../../models/course-agent.js';

import { publicCourseAgentEvent } from './public-events.js';
import { type CourseAgentMessage, courseAgentUIStream } from './ui-stream.js';

export async function restoreCourseAgentMessages(
  history: Awaited<ReturnType<typeof selectCourseAgentHistory>>,
) {
  const messages: CourseAgentMessage[] = [];
  for (const user of history.messages.filter((message) => message.role === 'user')) {
    messages.push({
      id: user.id,
      role: 'user',
      metadata: { createdAt: user.created_at.toISOString() },
      parts: [{ type: 'text', text: user.content }],
    });
    if (!user.run_id) continue;
    const runId = user.run_id;
    const events = history.events
      .filter((event) => event.run_id === runId)
      .flatMap((event) => {
        const parsed = CourseAgentEventSchema.safeParse({
          sequence: Number(event.sequence),
          type: event.event_type,
          occurredAt: event.created_at.toISOString(),
          data: event.data,
        });
        return parsed.success ? (publicCourseAgentEvent(parsed.data) ?? []) : [];
      });
    if (events.some((event) => event.type === 'agent.completed' || event.type === 'run.failed')) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            sequence: -1,
            type: 'user.message' as const,
            occurredAt: user.created_at.toISOString(),
            data: { text: user.content, runId },
          });
          for (const event of events) {
            if (event.type !== 'user.message') controller.enqueue(event);
          }
          controller.close();
        },
      }).pipeThrough(courseAgentUIStream(runId));
      let assistant: CourseAgentMessage | undefined;
      for await (const message of readUIMessageStream<CourseAgentMessage>({
        stream,
        terminateOnError: true,
      })) {
        assistant = message;
      }
      if (assistant) messages.push(assistant);
    } else {
      const assistant = history.messages.find(
        (message) => message.run_id === runId && message.role === 'assistant',
      );
      if (assistant) {
        messages.push({
          id: runId,
          role: 'assistant',
          metadata: { createdAt: assistant.created_at.toISOString() },
          parts: [{ type: 'text', text: assistant.content }],
        });
      }
    }
  }
  return messages;
}
