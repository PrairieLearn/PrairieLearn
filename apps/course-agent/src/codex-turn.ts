import type { UIMessageChunk } from 'ai';

import type { AppServer } from './app-server.js';
import { CodexEvents } from './codex-events.js';
import type {
  DynamicToolCallParams,
  DynamicToolCallResponse,
  Turn,
  TurnSteerParams,
} from './protocol.js';
import { toolDefinitions } from './tools.js';

export type CodexTurn = Awaited<ReturnType<typeof openCodexTurn>>;

/** Own native turn controls and event translation; the Chat DO owns persistence, deadlines, and cleanup. */
export async function openCodexTurn(
  client: AppServer,
  {
    threadId,
    model,
    runId,
    write,
    onTurnStarted,
    onUsage,
    development = false,
    onToolCall,
  }: {
    development?: boolean;
    threadId?: string;
    model?: string;
    runId: string;
    write: (chunk: UIMessageChunk) => void;
    onTurnStarted: (turnId: string) => void;
    onUsage?: (value: { threadId: string; input: number; cached: number; output: number }) => void;
    onToolCall: (params: DynamicToolCallParams) => Promise<DynamicToolCallResponse>;
  },
) {
  const options = {
    cwd: '/workspace/repo',
    approvalPolicy: 'never' as const,
    model,
  };
  const { thread } = threadId
    ? await client.request('thread/resume', { ...options, threadId })
    : await client.request('thread/start', {
        ...options,
        dynamicTools: toolDefinitions(development),
      });
  if (thread.turns.some((turn) => turn.status === 'inProgress')) {
    throw new Error('Native thread still has an active turn.');
  }

  client.toolHandler = (params) => {
    if (params.threadId !== thread.id || params.turnId !== turnId || execution.terminal) {
      return Promise.reject(new Error('Tool call does not belong to the active turn.'));
    }
    return onToolCall(params);
  };
  const events = new CodexEvents(write, runId);
  const controls = new Set<Promise<unknown>>();

  async function control<T>(request: Promise<T>): Promise<T> {
    controls.add(request);
    try {
      return await request;
    } finally {
      controls.delete(request);
    }
  }
  let turnId: string | undefined;
  let resolve!: (turn: Turn) => void;
  const result = new Promise<Turn>((r) => {
    resolve = r;
  });
  const completed = Promise.race([result, client.disconnected]);
  // A disconnect can arrive before start() returns and its caller begins awaiting completion.
  void completed.catch(() => {});
  const execution = {
    client,
    threadId: thread.id,
    terminal: false,
    completed,
    /** Submit one prompt; the returned turn acknowledges acceptance, not completion. */
    async start(prompt: string, messageId: string) {
      const { turn } = await client.request('turn/start', {
        threadId: thread.id,
        // Cloudflare owns isolation and outbound network restrictions.
        sandboxPolicy: { type: 'externalSandbox', networkAccess: 'restricted' },
        summary: 'auto',
        clientUserMessageId: messageId,
        input: [{ type: 'text', text: prompt, text_elements: [] }],
      });
      turnId = turn.id;
      return turn;
    },
    /** Add input to the current native turn and mark its position in the UI stream after acceptance. */
    async steer(input: TurnSteerParams) {
      const result = await control(client.request('turn/steer', input));
      events.steering(
        input.clientUserMessageId ?? crypto.randomUUID(),
        input.input
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('\n'),
      );
      return result;
    },
    interrupt(turnId: string) {
      return control(client.request('turn/interrupt', { threadId: thread.id, turnId }));
    },
    async close() {
      // A terminal notification can precede the acknowledgment of Stop or steering.
      await Promise.allSettled(controls);
      client.toolHandler = undefined;
      unsubscribe();
      events.finish();
    },
  };
  const unsubscribe = client.subscribe((event) => {
    if (event.params.threadId !== thread.id) return;
    if (event.method === 'thread/tokenUsage/updated') {
      const usage = event.params.tokenUsage.total;
      onUsage?.({
        threadId: thread.id,
        input: usage.inputTokens,
        cached: usage.cachedInputTokens,
        output: usage.outputTokens,
      });
    } else if (event.method === 'turn/started') {
      turnId = event.params.turn.id;
      onTurnStarted(turnId);
    } else if (event.method === 'turn/completed') {
      if (!turnId || event.params.turn.id === turnId) {
        execution.terminal = true;
        for (const item of event.params.turn.items) events.item(item);
        resolve(event.params.turn);
      }
    } else if (event.params.turnId === turnId) {
      events.accept(event);
    }
  });
  return execution;
}
