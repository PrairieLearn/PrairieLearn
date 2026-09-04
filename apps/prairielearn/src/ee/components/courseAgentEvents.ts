import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

export interface CourseAgentTurn {
  userMessage: CourseAgentEvent;
  events: CourseAgentEvent[];
}

export interface CourseAgentActivityItem {
  key: string;
  sequence: number;
  label: string;
  status: 'pending' | 'completed' | 'failed';
  kind: 'lifecycle' | 'tool';
}

export function groupCourseAgentTurns(events: CourseAgentEvent[]) {
  const turns: CourseAgentTurn[] = [];
  let pendingEvents: CourseAgentEvent[] = [];
  let current: CourseAgentTurn | null = null;

  for (const event of events) {
    if (event.type === 'user.message') {
      if (current) turns.push(current);
      current = { userMessage: event, events: pendingEvents };
      pendingEvents = [];
    } else if (current) {
      current.events.push(event);
    } else {
      pendingEvents.push(event);
    }
  }

  if (current) turns.push(current);
  return turns;
}

export function getCourseAgentActivity(events: CourseAgentEvent[]) {
  const items: CourseAgentActivityItem[] = [];
  const failed = events.some((event) => event.type === 'run.failed');
  const sandboxStart = events.find((event) => event.type === 'sandbox.starting');
  if (sandboxStart) {
    const ready = events.some((event) => event.type === 'sandbox.ready');
    const restoring = sandboxStart.data.restoring === true;
    items.push({
      key: `sandbox-${sandboxStart.sequence}`,
      sequence: sandboxStart.sequence,
      label: ready
        ? restoring
          ? 'Restored agent'
          : 'Started agent'
        : restoring
          ? 'Restoring agent'
          : 'Starting agent',
      status: ready ? 'completed' : failed ? 'failed' : 'pending',
      kind: 'lifecycle',
    });
  }

  const workspace = events.find((event) => event.type === 'workspace.seeded');
  if (workspace) {
    items.push({
      key: `workspace-${workspace.sequence}`,
      sequence: workspace.sequence,
      label: 'Set up course',
      status: 'completed',
      kind: 'lifecycle',
    });
  }

  const operations = new Map<string, CourseAgentActivityItem>();
  for (const event of events) {
    if (!event.type.startsWith('tool.')) continue;
    const operationId = String(event.data.operationId ?? event.sequence);
    const existing = operations.get(operationId);
    const status =
      event.type === 'tool.failed'
        ? 'failed'
        : event.type === 'tool.completed'
          ? 'completed'
          : failed
            ? 'failed'
            : 'pending';
    operations.set(operationId, {
      key: `tool-${operationId}`,
      sequence: existing?.sequence ?? event.sequence,
      label: String(event.data.label ?? event.data.tool ?? existing?.label ?? 'Used a tool'),
      status,
      kind: 'tool',
    });
  }

  return [...items, ...operations.values()].sort((left, right) => left.sequence - right.sequence);
}
