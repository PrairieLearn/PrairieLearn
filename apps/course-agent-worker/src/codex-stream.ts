import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

import { toolEvents } from './codex-events.js';

type EmittedEvent = Pick<CourseAgentEvent, 'type' | 'data'>;

export class CodexStream {
  response = '';
  private messages = new Map<string, string>();

  consume(event: Record<string, unknown>): EmittedEvent[] {
    const params = event.params;
    if (!isRecord(params)) return [];
    if (event.method === 'thread/started' && isRecord(params.thread)) {
      return [{ type: 'agent.started', data: { threadId: params.thread.id } }];
    }
    if (
      event.method === 'thread/tokenUsage/updated' &&
      isRecord(params.tokenUsage) &&
      isRecord(params.tokenUsage.total)
    ) {
      const usage = params.tokenUsage.total;
      return [
        {
          type: 'usage.updated',
          data: {
            input_tokens: usage.inputTokens,
            cached_input_tokens: usage.cachedInputTokens,
            cache_write_input_tokens: usage.cacheWriteInputTokens ?? 0,
            output_tokens: usage.outputTokens,
            reasoning_output_tokens: usage.reasoningOutputTokens,
          },
        },
      ];
    }
    if (
      event.method === 'item/agentMessage/delta' &&
      typeof params.itemId === 'string' &&
      typeof params.delta === 'string' &&
      this.messages.has(params.itemId)
    ) {
      this.messages.set(params.itemId, this.messages.get(params.itemId)! + params.delta);
      return this.append(params.delta);
    }
    if (
      !['item/started', 'item/completed'].includes(String(event.method)) ||
      !isRecord(params.item)
    ) {
      return [];
    }
    const item = params.item;
    if (item.type === 'agentMessage' && typeof item.id === 'string') {
      // Commentary and reasoning stay out of the concise instructor transcript.
      if (item.phase === 'commentary') return [];
      const previous = this.messages.get(item.id);
      const text = typeof item.text === 'string' ? item.text : '';
      const separator = previous === undefined && this.response ? '\n\n' : '';
      this.messages.set(item.id, text || previous || '');
      if (event.method === 'item/started') return this.append(separator + text);
      if (!text.startsWith(previous ?? '')) throw new Error('Codex replaced streamed message text');
      return this.append(separator + text.slice(previous?.length ?? 0));
    }
    const types: Record<string, string> = {
      commandExecution: 'command_execution',
      fileChange: 'file_change',
      webSearch: 'web_search',
      mcpToolCall: 'mcp_tool_call',
    };
    const changes = Array.isArray(item.changes)
      ? item.changes.map((change: unknown) =>
          isRecord(change) && isRecord(change.kind)
            ? { ...change, kind: change.kind.type }
            : change,
        )
      : item.changes;
    return toolEvents({
      type: event.method === 'item/started' ? 'item.started' : 'item.completed',
      item: { ...item, type: types[String(item.type)], changes },
    });
  }

  private append(text: string): EmittedEvent[] {
    if (!text) return [];
    this.response += text;
    return [{ type: 'assistant.delta', data: { text } }];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
