import { z } from 'zod';

import type { Clip, ToolCall } from '@prairielearn/course-agent-types';

/** The agent's working directory, a checkout of the course. */
export const COURSE_DIR = '/workspace/session/course';

/** Bounds on what one call adds to chat history; Codex's thread keeps the full record. */
const OUTPUT_CHARS = 4_000;
// Heredocs put whole files in the command; its first line is what labels the call.
const COMMAND_CHARS = 2_000;
const ARGUMENT_CHARS = 1_000;
const DIFF_CHARS = 4_000;
const MAX_FILES = 50;
/**
 * ai-chat stores a message as one Durable Object row (2 MB at most), and a turn may make any
 * number of calls. Past this many characters of tool calls, a message keeps only their labels.
 */
export const MESSAGE_TOOL_CHARS = 300_000;

/** Items that are not tool calls, or that chat already shows another way. */
const NOT_TOOL_CALLS = new Set([
  'userMessage',
  'agentMessage',
  'reasoning',
  'plan',
  'hookPrompt',
  'contextCompaction',
  'functionCallOutput',
]);

// Validate only fields this module reads; Codex items carry more.
const Status = z.string().optional();
const CommandItem = z.object({
  type: z.literal('commandExecution'),
  command: z.string(),
  status: Status,
  commandActions: z.array(
    z.object({
      type: z.string(),
      name: z.string().nullish(),
      path: z.string().nullish(),
      query: z.string().nullish(),
    }),
  ),
  aggregatedOutput: z.string().nullable(),
  exitCode: z.number().nullable(),
  durationMs: z.number().nullable(),
});
const FileChangeItem = z.object({
  type: z.literal('fileChange'),
  status: Status,
  changes: z.array(
    z.object({
      path: z.string(),
      kind: z.object({
        type: z.enum(['add', 'delete', 'update']),
        move_path: z.string().nullish(),
      }),
      diff: z.string(),
    }),
  ),
});
const McpItem = z.object({
  type: z.literal('mcpToolCall'),
  server: z.string(),
  tool: z.string(),
  status: Status,
  arguments: z.unknown(),
  result: z.object({ content: z.array(z.unknown()) }).nullable(),
  error: z.object({ message: z.string() }).nullable(),
  durationMs: z.number().nullable(),
});
const DynamicItem = z.object({
  type: z.literal('dynamicToolCall'),
  namespace: z.string().nullable(),
  tool: z.string(),
  status: Status,
  arguments: z.unknown(),
  contentItems: z.array(z.object({ type: z.string(), text: z.string().optional() })).nullable(),
  success: z.boolean().nullable(),
  durationMs: z.number().nullable(),
});
const WebSearchItem = z.object({
  type: z.literal('webSearch'),
  query: z.string(),
  action: z
    .object({
      type: z.string(),
      queries: z.array(z.string()).nullish(),
      url: z.string().nullish(),
      pattern: z.string().nullish(),
    })
    .nullable(),
});
const Item = z.discriminatedUnion('type', [
  CommandItem,
  FileChangeItem,
  McpItem,
  DynamicItem,
  WebSearchItem,
]);
const OtherItem = z.object({ type: z.string(), path: z.string().nullish(), status: Status });

/** Keep the start and the end, where errors usually are. */
export function clip(text: string, limit: number, head = Math.floor(limit / 4)): Clip {
  if (text.length <= limit) return { text, omitted: 0 };
  const start = text.slice(0, Math.min(head, limit));
  const tail = limit - start.length;
  return {
    text: tail > 0 ? `${start}\n…\n${text.slice(-tail)}` : start,
    omitted: text.length - limit,
  };
}

/** Show course paths as instructors know them, relative to the course root. */
function coursePath(path: string) {
  if (path === COURSE_DIR) return '.';
  return path.startsWith(`${COURSE_DIR}/`) ? path.slice(COURSE_DIR.length + 1) : path;
}

function status(phase: 'started' | 'completed', codexStatus: string | undefined) {
  if (phase === 'started') return 'running';
  if (codexStatus === 'failed' || codexStatus === 'declined') return codexStatus;
  return 'completed';
}

function json(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'object' && Object.keys(value).length === 0) return '';
  return JSON.stringify(value, null, 2);
}

/** New and deleted files arrive as whole contents; mark their lines so every change is a diff. */
function diffOf(kind: 'add' | 'delete' | 'update', diff: string) {
  if (kind === 'update') return diff;
  const lines = diff.replace(/\n$/, '').split('\n');
  const marker = kind === 'add' ? '+' : '-';
  const range = `1,${lines.length}`;
  const hunk = kind === 'add' ? `@@ -0,0 +${range} @@` : `@@ -${range} +0,0 @@`;
  return [hunk, ...lines.map((line) => marker + line)].join('\n');
}

/** File headers (`--- a/x`, `+++ b/x`) come before the first hunk; later lines are content. */
function countLines(diff: string, marker: '+' | '-') {
  let inHunk = false;
  let count = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      inHunk = true;
    } else if (line.startsWith(marker) && (inHunk || !line.startsWith(`${marker.repeat(3)} `))) {
      count++;
    }
  }
  return count;
}

/** The chat history form of a Codex item, or null if it is not a tool call. */
export function toolCallFromItem(
  phase: 'started' | 'completed',
  value: { type: string; [key: string]: unknown },
  /** False for a message over its budget: keep labels, drop output, diffs, and arguments. */
  details = true,
): ToolCall | null {
  const keep = (limit: number) => (details ? limit : 0);
  if (NOT_TOOL_CALLS.has(value.type)) return null;
  const parsed = Item.safeParse(value);
  if (!parsed.success) {
    const other = OtherItem.safeParse(value);
    if (!other.success) return null;
    return {
      v: 1,
      kind: 'other',
      itemType: other.data.type,
      path: other.data.path ? coursePath(other.data.path) : null,
      status: status(phase, other.data.status),
      durationMs: null,
    };
  }
  const item = parsed.data;
  switch (item.type) {
    case 'commandExecution':
      return {
        v: 1,
        kind: 'command',
        status: status(phase, item.status),
        durationMs: item.durationMs,
        command: clip(item.command, COMMAND_CHARS, COMMAND_CHARS).text,
        actions: item.commandActions.map((action) => {
          if (action.type === 'read' && action.path) {
            return {
              type: 'read',
              name: action.name ?? action.path,
              path: coursePath(action.path),
            };
          }
          if (action.type === 'listFiles') {
            return { type: 'listFiles', path: action.path ? coursePath(action.path) : null };
          }
          if (action.type === 'search') {
            return {
              type: 'search',
              query: action.query ?? null,
              path: action.path ? coursePath(action.path) : null,
            };
          }
          return { type: 'unknown' };
        }),
        exitCode: item.exitCode,
        output: item.aggregatedOutput ? clip(item.aggregatedOutput, keep(OUTPUT_CHARS)) : null,
      };
    case 'fileChange':
      return {
        v: 1,
        kind: 'fileChange',
        status: status(phase, item.status),
        durationMs: null,
        changes: item.changes.slice(0, MAX_FILES).map((change) => {
          const diff = diffOf(change.kind.type, change.diff);
          return {
            path: coursePath(change.path),
            change: change.kind.type,
            movePath: change.kind.move_path ? coursePath(change.kind.move_path) : null,
            added: countLines(diff, '+'),
            removed: countLines(diff, '-'),
            diff: clip(diff, keep(DIFF_CHARS), DIFF_CHARS),
          };
        }),
        omittedChanges: Math.max(0, item.changes.length - MAX_FILES),
      };
    case 'mcpToolCall': {
      const output = item.result?.content
        .map((block) => {
          const text = z.object({ type: z.literal('text'), text: z.string() }).safeParse(block);
          return text.success ? text.data.text : JSON.stringify(block);
        })
        .join('\n');
      return {
        v: 1,
        kind: 'tool',
        status: status(phase, item.status),
        durationMs: item.durationMs,
        server: item.server,
        tool: item.tool,
        arguments: clip(json(item.arguments), keep(ARGUMENT_CHARS)),
        output: output ? clip(output, keep(OUTPUT_CHARS)) : null,
        error: item.error ? clip(item.error.message, OUTPUT_CHARS, OUTPUT_CHARS).text : null,
      };
    }
    case 'dynamicToolCall': {
      const output = item.contentItems
        ?.flatMap((content) => (content.text === undefined ? [] : [content.text]))
        .join('\n');
      return {
        v: 1,
        kind: 'tool',
        status:
          phase === 'completed' && item.success === false ? 'failed' : status(phase, item.status),
        durationMs: item.durationMs,
        server: item.namespace,
        tool: item.tool,
        arguments: clip(json(item.arguments), keep(ARGUMENT_CHARS)),
        output: output ? clip(output, keep(OUTPUT_CHARS)) : null,
        error: null,
      };
    }
    case 'webSearch': {
      const action = item.action;
      return {
        v: 1,
        kind: 'webSearch',
        status: status(phase, undefined),
        durationMs: null,
        action:
          action?.type === 'openPage' || action?.type === 'findInPage' || action?.type === 'search'
            ? action.type
            : 'other',
        query: item.query || action?.queries?.join(', ') || action?.pattern || '',
        target: action?.url ?? null,
      };
    }
  }
}
