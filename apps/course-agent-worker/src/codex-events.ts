import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

type EmittedEvent = Pick<CourseAgentEvent, 'type' | 'data'>;

export function parseCodexLine(line: string) {
  try {
    const value = JSON.parse(line) as unknown;
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function finalResponse(stdout: string) {
  for (const event of stdout.split('\n').map(parseCodexLine).toReversed()) {
    if (event?.type !== 'item.completed' || !isRecord(event.item)) continue;
    if (event.item.type === 'agent_message' && typeof event.item.text === 'string') {
      return event.item.text;
    }
  }
  return 'Done.';
}

export function toolEvents(event: Record<string, unknown>): EmittedEvent[] {
  if (!['item.started', 'item.completed'].includes(String(event.type)) || !isRecord(event.item)) {
    return [];
  }

  const item = event.item;
  if (item.type === 'agent_message') return [];

  const label = toolLabel(item);
  if (!label) return [];

  const operationId = typeof item.id === 'string' ? item.id : crypto.randomUUID();
  if (event.type === 'item.started') {
    return [{ type: 'tool.started', data: { operationId, label } }];
  }

  return [
    {
      type: item.status === 'failed' ? 'tool.failed' : 'tool.completed',
      data: { operationId, label },
    },
  ];
}

function toolLabel(item: Record<string, unknown>) {
  switch (item.type) {
    case 'command_execution':
      return commandLabel(typeof item.command === 'string' ? item.command : '');
    case 'file_change':
      return fileChangeLabel(item.changes);
    case 'web_search':
      return typeof item.query === 'string' && item.query.trim()
        ? `Searched the web for “${truncate(item.query.trim(), 100)}”`
        : 'Searched the web';
    case 'mcp_tool_call': {
      const name =
        typeof item.tool === 'string'
          ? item.tool
          : typeof item.name === 'string'
            ? item.name
            : null;
      return name ? `Used ${humanize(name)}` : 'Used a PrairieLearn tool';
    }
    default:
      return null;
  }
}

function commandLabel(command: string) {
  const path = findUsefulPath(command);
  if (/\b(?:rg|grep|find)\b/.test(command)) return `Searched ${path ?? 'the workspace'}`;
  if (/\b(?:cat|head|less|sed|tail)\b/.test(command)) return `Read ${path ?? 'workspace files'}`;
  if (/\b(?:ls|tree)\b/.test(command)) return `Listed ${path ?? 'the workspace'}`;
  if (/\b(?:test|vitest|pytest|playwright)\b/.test(command)) return 'Ran tests';
  if (/\b(?:validate|validation|lint|pyright|typecheck)\b/i.test(command)) return 'Ran validation';
  if (/\bpython(?:3(?:\.\d+)?)?\b/.test(command)) return 'Ran Python';
  return 'Ran a command';
}

function fileChangeLabel(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return 'Edited files';
  const changes = value.filter(isRecord);
  if (changes.length !== 1) return `Edited ${changes.length || value.length} files`;

  const change = changes[0];
  const path = typeof change.path === 'string' ? change.path : 'a file';
  const verb =
    change.kind === 'add' || change.kind === 'create'
      ? 'Created'
      : change.kind === 'delete'
        ? 'Deleted'
        : 'Edited';
  return `${verb} ${path}`;
}

function findUsefulPath(command: string) {
  const workspacePath = command.match(/\/workspace(?:\/[\w@%+.,:=~-]+)*/)?.[0];
  if (workspacePath) return workspacePath;

  const relativePaths = Array.from(
    command.matchAll(/(?:^|[\s'"])((?:\.\.\/|\.\/)?(?:[\w@%+.,:=~-]+\/)+[\w@%+.,:=~-]+)/g),
    (match) => match[1],
  ).filter((path) => !path.startsWith('/bin/') && !path.startsWith('/usr/'));
  const fileName = command.match(
    /(?:^|[\s'"])([\w.-]+\.(?:md|html|json|py|ts|tsx|js|css|sql))(?:$|[\s'"])/,
  )?.[1];
  return relativePaths.at(-1) ?? fileName ?? null;
}

function humanize(value: string) {
  return value.replaceAll(/[-_]+/g, ' ');
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
