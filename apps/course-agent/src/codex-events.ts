import type { UIMessageChunk } from 'ai';

import type { CodexNotification } from './codex-notifications.js';
import type { ThreadItem } from './generated/v2/ThreadItem.js';

/**
 * Runs in the Chat DO. Native item IDs survive deltas and final snapshots, while
 * the AI SDK requires each text/reasoning part to have a start/end pair. Steering
 * closes the current segment before its user marker; later deltas get a new
 * segment so the correction appears where Codex accepted it in the transcript.
 */
export class CodexEvents {
  private parts = new Map<
    string,
    {
      text: string;
      kind: 'text' | 'reasoning';
      segment: number;
      open: boolean;
      ended: boolean;
    }
  >();

  private tools = new Set<string>();
  private completedTools = new Set<string>();
  private write: (chunk: UIMessageChunk) => void;
  private namespace: string;
  constructor(write: (chunk: UIMessageChunk) => void, namespace: string) {
    this.write = write;
    this.namespace = namespace;
  }

  /** Consume a native notification after the turn coordinator filters its thread/turn identity. */
  accept(event: CodexNotification) {
    if (event.method === 'item/agentMessage/delta') {
      this.delta(event.params.itemId, 'text', event.params.delta);
    } else if (event.method === 'item/reasoning/summaryTextDelta') {
      this.delta(
        `${event.params.itemId}:summary:${event.params.summaryIndex}`,
        'reasoning',
        event.params.delta,
      );
    } else if (event.method === 'item/started' || event.method === 'item/completed') {
      this.item(event.params.item, event.method === 'item/completed');
    }
  }

  private close(key: string) {
    const part = this.parts.get(key)!;
    if (!part.open) return;
    this.write({
      type: `${part.kind}-end`,
      id: `${this.namespace}:${key}:${part.segment}`,
    });
    part.open = false;
    part.segment++;
  }

  /** Close open segments so this user correction appears at its actual position in the stream. */
  steering(id: string, text: string) {
    for (const key of this.parts.keys()) this.close(key);
    this.write({ type: 'data-steering', id, data: { id, text } });
  }

  private delta(key: string, kind: 'text' | 'reasoning', delta: string) {
    let part = this.parts.get(key);
    if (!part) {
      part = { text: '', kind, segment: 0, open: false, ended: false };
      this.parts.set(key, part);
    }
    if (part.ended) return;
    const id = `${this.namespace}:${key}:${part.segment}`;
    if (!part.open) {
      this.write({ type: `${kind}-start`, id });
      part.open = true;
    }
    part.text += delta;
    if (delta) this.write({ type: `${kind}-delta`, id, delta });
  }

  private complete(key: string, kind: 'text' | 'reasoning', text: string) {
    const existing = this.parts.get(key);
    if (existing?.ended) return;
    this.delta(
      key,
      kind,
      text.startsWith(existing?.text ?? '') ? text.slice(existing?.text.length ?? 0) : '',
    );
    this.close(key);
    this.parts.get(key)!.ended = true;
  }

  /** Merge a native item snapshot without repeating text already emitted as deltas. */
  item(item: ThreadItem, completed = true) {
    const id = `${this.namespace}:${item.id}`;
    if (item.type === 'agentMessage' && completed) this.complete(item.id, 'text', item.text);
    if (item.type === 'reasoning' && completed) {
      item.summary.forEach((text, index) =>
        this.complete(`${item.id}:summary:${index}`, 'reasoning', text),
      );
    }
    if (item.type === 'dynamicToolCall') {
      if (this.completedTools.has(id)) return;
      if (!this.tools.has(id)) {
        this.tools.add(id);
        this.write({
          type: 'tool-input-available',
          toolCallId: id,
          dynamic: true,
          toolName: item.tool,
          input: item.arguments,
        });
      }
      if (completed) {
        this.tools.delete(id);
        this.completedTools.add(id);
        if (item.success === false) {
          this.write({
            type: 'tool-output-error',
            toolCallId: id,
            errorText: (item.contentItems ?? [])
              .flatMap((content) => (content.type === 'inputText' ? [content.text] : []))
              .join('\n'),
          });
        } else {
          this.write({ type: 'tool-output-available', toolCallId: id, output: item.contentItems });
        }
      }
      return;
    }
    if (item.type !== 'commandExecution' && item.type !== 'fileChange') return;
    if (this.completedTools.has(id)) return;
    if (!this.tools.has(id)) {
      this.tools.add(id);
      this.write({
        type: 'tool-input-available',
        toolCallId: id,
        dynamic: true,
        toolName: item.type === 'commandExecution' ? 'command_execution' : 'file_change',
        input:
          item.type === 'commandExecution' ? { command: item.command } : { changes: item.changes },
      });
    }
    if (completed) {
      this.tools.delete(id);
      this.completedTools.add(id);
      this.write({
        type: 'tool-output-available',
        toolCallId: id,
        output:
          item.type === 'commandExecution'
            ? { output: item.aggregatedOutput, exitCode: item.exitCode }
            : { changes: item.changes, status: item.status },
      });
    }
  }

  finish(errorText = 'Codex stopped before reporting a result.') {
    for (const key of this.parts.keys()) this.close(key);
    for (const toolCallId of this.tools) {
      this.write({ type: 'tool-output-error', toolCallId, errorText });
    }
    this.tools.clear();
  }
}
