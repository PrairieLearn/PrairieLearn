import { type CourseAgentEvent, CourseAgentEventSchema } from '@prairielearn/course-agent-protocol';

export function publicCourseAgentEvent(event: CourseAgentEvent): CourseAgentEvent | null {
  const fields: Partial<Record<CourseAgentEvent['type'], string[]>> = {
    'user.message': ['text'],
    'assistant.delta': ['text', 'replace'],
    'tool.started': ['operationId', 'label'],
    'tool.completed': ['operationId', 'label'],
    'tool.failed': ['operationId', 'label'],
    'sandbox.starting': ['restoring'],
    'sandbox.ready': [],
    'sandbox.destroyed': ['reason'],
    'agent.completed': ['response'],
    'run.failed': ['message'],
  };
  const allowed = fields[event.type];
  if (!allowed) return null;
  return {
    ...event,
    data: Object.fromEntries(
      allowed.filter((key) => key in event.data).map((key) => [key, event.data[key]]),
    ),
  };
}

export function publicCourseAgentStream() {
  let buffer = '';
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice(6);
        if (!data) continue;
        const event = publicCourseAgentEvent(CourseAgentEventSchema.parse(JSON.parse(data)));
        if (event) {
          controller.enqueue(
            `id: ${event.sequence}\nevent: course-agent\ndata: ${JSON.stringify(event)}\n\n`,
          );
        }
      }
    },
    flush() {
      if (buffer.trim()) throw new Error('The course-agent stream ended unexpectedly');
    },
  });
}
