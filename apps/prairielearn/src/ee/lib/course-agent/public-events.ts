import { type CourseAgentEvent } from '@prairielearn/course-agent-protocol';

export function publicCourseAgentEvent(event: CourseAgentEvent): CourseAgentEvent | null {
  const fields: Partial<Record<CourseAgentEvent['type'], string[]>> = {
    'ui.chunk': ['chunk'],
    'user.message': ['text', 'runId'],
    'assistant.delta': ['text', 'replace'],
    'tool.started': ['operationId', 'label'],
    'tool.completed': ['operationId', 'label'],
    'tool.failed': ['operationId', 'label'],
    'sandbox.starting': ['restoring'],
    'sandbox.ready': [],
    'sandbox.destroyed': ['reason'],
    'agent.completed': ['response'],
    'run.failed': ['message'],
    'git.push.approval.requested': ['approvalId'],
    'sync.completed': ['approvalId', 'commitSha'],
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
