import type { UIMessageChunk } from 'ai';
import { type MessageConnection, ParameterStructures } from 'vscode-jsonrpc/browser';
import { z } from 'zod';

import {
  COURSE_DIR,
  CourseDataQuerySchema,
  type InputRequestPart,
  type NavigationPart,
  type NavigationTarget,
  NavigationTargetSchema,
  type PageCatalog,
  type ToolCall,
} from '@prairielearn/course-agent-types';

import type { InitializeParams } from '../../generated/types/InitializeParams.js';
import type { JsonValue } from '../../generated/types/serde_json/JsonValue.js';
import type { DynamicToolCallParams } from '../../generated/types/v2/DynamicToolCallParams.js';
import type { DynamicToolCallResponse } from '../../generated/types/v2/DynamicToolCallResponse.js';
import type { DynamicToolSpec } from '../../generated/types/v2/DynamicToolSpec.js';
import type { ThreadItemsListParams } from '../../generated/types/v2/ThreadItemsListParams.js';
import type { ThreadResumeParams } from '../../generated/types/v2/ThreadResumeParams.js';
import type { ThreadStartParams } from '../../generated/types/v2/ThreadStartParams.js';
import type { TurnInterruptParams } from '../../generated/types/v2/TurnInterruptParams.js';
import type { TurnStartParams } from '../../generated/types/v2/TurnStartParams.js';

import { createCodexConnection } from './codex-connection.js';
import type { CourseSandbox } from './sandbox.js';
import { MESSAGE_TOOL_CHARS, toolCallFromItem } from './tool-calls.js';

// Validate only fields consumed by this adapter; Codex may return additional data.
const EmptyResult = z.object({});
const ThreadResult = z.object({ thread: z.object({ id: z.string() }) });
const TurnResult = z.object({ turn: z.object({ id: z.string() }) });
const TextDelta = z.object({
  threadId: z.string(),
  turnId: z.string(),
  itemId: z.string(),
  delta: z.string(),
});
const TurnCompleted = z.object({
  threadId: z.string(),
  turn: z.object({
    id: z.string(),
    status: z.enum(['inProgress', 'completed', 'interrupted', 'failed']),
    error: z.object({ message: z.string() }).nullable(),
  }),
});

const ItemEvent = z.object({
  threadId: z.string(),
  turnId: z.string(),
  item: z.looseObject({ id: z.string(), type: z.string() }),
});
/**
 * `request_changes` shows as a review card and navigation as its own part; only a failed call
 * needs a tool entry.
 */
const CardToolItem = z.object({
  type: z.literal('dynamicToolCall'),
  tool: z.enum(['request_changes', 'navigate', 'refresh_page']),
  success: z.boolean().nullable(),
});
/** A dynamic tool call from Codex; each tool validates its own arguments. */
const DynamicToolCall = z.object({
  threadId: z.string(),
  turnId: z.string(),
  callId: z.string(),
  namespace: z.null(),
  tool: z.string(),
  arguments: z.unknown(),
});
const RequestChangesArguments = z.strictObject({});
const ListCourseDatasetsArguments = z.strictObject({});
const CourseDataArguments = CourseDataQuerySchema.extend({
  dataset: z.string().describe('Dataset to download, from list_course_datasets.'),
});
export type CourseDataRequest = z.infer<typeof CourseDataArguments>;

/** Serves the course data tools; replies go to the model. */
export interface CourseDataTools {
  list(): Promise<ToolReply>;
  get(request: CourseDataRequest): Promise<ToolReply>;
}
/**
 * `request_user_input_async` completes an agent message whose text Codex never streams, so its
 * prompts are shown only through this item. Codex calls them questions.
 */
const InputRequestItem = z.object({
  type: z.literal('agentMessage'),
  id: z.string(),
  delivery: z.literal('async'),
  questions: z
    .array(z.object({ title: z.string(), options: z.array(z.string()).nullable() }))
    .min(1),
});
const UnstreamedAsyncMessage = z.object({
  type: z.literal('agentMessage'),
  delivery: z.literal('async'),
  text: z.string().min(1),
});
const ItemsPage = z.object({
  data: z.array(z.object({ item: z.object({ type: z.string(), clientId: z.string().nullish() }) })),
  nextCursor: z.string().nullable(),
});

/**
 * Input for one turn. Codex saves the tag on the turn's user message. A `once` input is never
 * submitted twice: an earlier attempt whose acknowledgment was lost already delivered it.
 */
export interface TurnInput {
  text: string;
  tag: string;
  once?: boolean;
  /**
   * The page the instructor was viewing. Codex shows it to the model as untrusted context ahead
   * of the text, keeps the text verbatim, and skips resending an unchanged page. Compaction
   * drops that page until it changes: https://github.com/openai/codex/issues/38269
   */
  page?: string;
  /** Text to prepend given the thread's latest tag (undefined for a thread started this turn). */
  catchUp?: (latestTag: string | null | undefined) => string | null;
}

/** The model receives the reply as the tool result; it does not wait for an instructor. */
export interface ToolReply {
  success: boolean;
  text: string;
}

/** A sandbox's app-server connection, reused across turns until Stop or sandbox cleanup. */
export class CodexAppServerClient {
  private rpc: MessageConnection | null = null;
  private controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  private terminal = Promise.withResolvers<undefined>();
  private turnId: string | null = null;
  private threadId: string | null = null;
  /** Codex cannot list a new thread's history until its first user message. */
  private newThread = false;
  private parts = new Map<string, 'text' | 'reasoning'>();
  /** Calls Codex has started but not finished, by history part ID. */
  private runningTools = new Map<string, ToolCall>();
  /** Tool call characters in the open message, which continuation turns append to. */
  private toolChars = { messageId: '', used: 0 };
  private failure: Error | null = null;
  private onReview?: (call: DynamicToolCallParams) => Promise<ToolReply>;
  /** Navigation calls are checked against the conversation's catalog, also on a resumed thread. */
  private pages: PageCatalog = [];

  constructor(
    private sandbox: DurableObjectStub<CourseSandbox>,
    private courseData: CourseDataTools,
    /** Resolves a navigation target to its URL, failing with a message for the agent. */
    private resolveNavigation: (target: NavigationTarget) => Promise<string>,
  ) {}

  beginTurn(messageId: string, onReview?: (call: DynamicToolCallParams) => Promise<ToolReply>) {
    if (this.controller) throw new Error('An SDK response is already open');
    this.terminal = Promise.withResolvers<undefined>();
    this.turnId = null;
    this.parts.clear();
    this.runningTools.clear();
    if (this.toolChars.messageId !== messageId) this.toolChars = { messageId, used: 0 };
    this.onReview = onReview;
    void this.terminal.promise.catch(() => {});
    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        this.controller = controller;
        controller.enqueue({ type: 'start', messageId });
      },
      cancel: () => {
        this.controller = null;
      },
    });
  }

  async connect() {
    if (this.failure) throw this.failure;
    if (this.rpc) return;
    const response = await this.sandbox.fetch('http://codex.internal/', {
      headers: { Upgrade: 'websocket' },
    });
    if (response.status !== 101 || !response.webSocket) {
      throw new Error('Native runner supplied no WebSocket');
    }
    const socket = response.webSocket;
    const rpc = createCodexConnection(socket, (error) => this.fail(error));
    this.rpc = rpc;
    const onNotification = <P>(
      method: string,
      schema: z.ZodType<P>,
      handler: (params: P) => void,
    ) =>
      rpc.onNotification(method, (value: unknown) => {
        try {
          const parsed = schema.safeParse(value);
          if (!parsed.success) throw new Error(`Invalid notification: ${method}`);
          handler(parsed.data);
        } catch (error) {
          this.fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
    rpc.onRequest('item/tool/call', async (value: unknown) => {
      const reply = await this.callTool(value);
      return {
        success: reply.success,
        contentItems: [{ type: 'inputText', text: reply.text }],
      } satisfies DynamicToolCallResponse;
    });
    rpc.listen();
    onNotification('item/agentMessage/delta', TextDelta, (params) => this.delta('text', params));
    onNotification('item/reasoning/summaryTextDelta', TextDelta, (params) =>
      this.delta('reasoning', params),
    );
    onNotification('item/started', ItemEvent, (params) => this.toolCall('started', params));
    onNotification('item/completed', ItemEvent, (params) => {
      this.toolCall('completed', params);
      const { threadId, turnId, item } = params;
      if (threadId !== this.threadId || (this.turnId && turnId !== this.turnId)) return;
      const request = InputRequestItem.safeParse(item);
      if (request.success) {
        this.emit({
          type: 'data-input-request',
          id: `input-request:${item.id}`,
          data: {
            v: 1,
            itemId: item.id,
            prompts: request.data.questions,
          } satisfies InputRequestPart,
        });
        return;
      }
      // Async agent messages arrive only here, complete, never as streamed deltas, so the text
      // handling below would drop them. If a Codex upgrade changes the input request shape so the
      // check above fails, show the message's text rather than silently losing what was asked.
      const unparsed = UnstreamedAsyncMessage.safeParse(item);
      if (unparsed.success) {
        const id = `text:${item.id}`;
        this.emit({ type: 'text-start', id });
        this.emit({ type: 'text-delta', id, delta: unparsed.data.text });
        this.emit({ type: 'text-end', id });
        return;
      }
      const type =
        item.type === 'agentMessage' ? 'text' : item.type === 'reasoning' ? 'reasoning' : null;
      if (!type) return;
      const id = `${type}:${item.id}`;
      if (this.parts.delete(id)) {
        this.emit({ type: type === 'text' ? 'text-end' : 'reasoning-end', id });
      }
    });
    onNotification('turn/completed', TurnCompleted, (params) => {
      if (params.threadId !== this.threadId || (this.turnId && params.turn.id !== this.turnId)) {
        return;
      }
      if (params.turn.status === 'failed') {
        this.terminal.reject(new Error(params.turn.error?.message ?? 'Native turn failed'));
      } else if (params.turn.status === 'completed' || params.turn.status === 'interrupted') {
        this.terminal.resolve(undefined);
      }
    });
    socket.accept();
    await this.request(
      'initialize',
      {
        clientInfo: { name: 'prairielearn', title: 'PrairieLearn', version: '1' },
        capabilities: { experimentalApi: true, requestAttestation: false },
      } satisfies InitializeParams,
      EmptyResult,
    );
    await rpc.sendNotification('initialized');
  }

  private get connection() {
    if (!this.rpc) throw new Error('Native runner is not connected');
    return this.rpc;
  }

  private async callTool(value: unknown): Promise<ToolReply> {
    const call = DynamicToolCall.safeParse(value);
    if (!call.success || call.data.threadId !== this.threadId) {
      throw new Error('Invalid dynamic tool call');
    }
    switch (call.data.tool) {
      case listCourseDatasetsTool.name: {
        const request = ListCourseDatasetsArguments.safeParse(call.data.arguments);
        if (!request.success) return invalidArguments(request.error);
        return await replyWithError(() => this.courseData.list());
      }
      case courseDataTool.name: {
        const request = CourseDataArguments.safeParse(call.data.arguments);
        if (!request.success) return invalidArguments(request.error);
        return await replyWithError(() => this.courseData.get(request.data));
      }
      case requestChangesTool.name: {
        if (!this.onReview || !RequestChangesArguments.safeParse(call.data.arguments).success) {
          throw new Error('Invalid request_changes call');
        }
        return await this.onReview({ ...call.data, arguments: {} });
      }
      case 'navigate':
        return await this.navigate(call.data.callId, call.data.arguments);
      case refreshPageTool.name: {
        const navigation: NavigationPart = { action: 'refresh' };
        // The browser acts on this part; the reply cannot confirm the page reloaded.
        this.emit({
          type: 'data-navigation',
          id: `navigation:${call.data.callId}`,
          data: navigation,
        });
        return { success: true, text: "The instructor's page is reloading." };
      }
      default:
        throw new Error(`Unknown tool: ${call.data.tool}`);
    }
  }

  private async navigate(callId: string, args: unknown): Promise<ToolReply> {
    const target = NavigationTargetSchema.safeParse(args);
    if (!target.success) return invalidArguments(target.error);
    const page = this.pages.find((entry) => entry.key === target.data.page);
    if (!page) return { success: false, text: `Unknown page "${target.data.page}".` };
    return await replyWithError(async () => {
      const url = await this.resolveNavigation(target.data);
      const navigation: NavigationPart = {
        action: 'open',
        target: target.data,
        label: page.label,
        url,
      };
      // The browser acts on this part; the reply cannot confirm the page loaded.
      this.emit({ type: 'data-navigation', id: `navigation:${callId}`, data: navigation });
      return { success: true, text: "The instructor's browser is opening the page." };
    });
  }

  private fail(error: Error) {
    this.failure = error;
    this.terminal.reject(error);
    this.rpc?.dispose();
    this.rpc = null;
  }

  private async request<R>(method: string, params: unknown, schema: z.ZodType<R>): Promise<R> {
    const connection = this.connection;
    // A timeout means acceptance is unknown. Dispose pending work without replaying the command.
    const timeout = setTimeout(
      () => this.fail(new Error(`Native command did not settle: ${method}`)),
      30_000,
    );
    try {
      const result = await connection.sendRequest<unknown>(
        method,
        ParameterStructures.byName,
        params,
      );
      const parsed = schema.safeParse(result);
      if (!parsed.success) {
        const error = new Error(`Invalid result for ${method}`);
        this.fail(error);
        throw error;
      }
      return parsed.data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async thread(config: {
    model: string;
    instructions: string;
    threadId: string | null;
    pages: PageCatalog;
  }) {
    this.pages = config.pages;
    const settings = {
      model: config.model,
      cwd: COURSE_DIR,
      approvalPolicy: 'never' as const,
      sandbox: 'danger-full-access' as const,
      developerInstructions: config.instructions,
    } satisfies ThreadStartParams;
    const result = config.threadId
      ? await this.request(
          'thread/resume',
          {
            ...settings,
            threadId: config.threadId,
            excludeTurns: true,
          } satisfies ThreadResumeParams,
          ThreadResult,
        )
      : await this.request(
          'thread/start',
          {
            ...settings,
            dynamicTools: [
              ...(this.onReview ? [requestChangesTool] : []),
              listCourseDatasetsTool,
              courseDataTool,
              ...(config.pages.length > 0 ? [navigateTool(config.pages)] : []),
              refreshPageTool,
            ],
          } satisfies ThreadStartParams,
          ThreadResult,
        );
    this.threadId = result.thread.id;
    this.newThread = !config.threadId;
    return result.thread.id;
  }

  /** Submit one turn, with any catch-up text in the same input so both are accepted together. */
  async run(input: TurnInput, accepted: (turnId: string | null) => void) {
    // A thread started for this turn has no history, and Codex cannot list it yet.
    const latestTag =
      this.newThread || (!input.once && !input.catchUp) ? undefined : await this.latestClientId();
    if (input.once && !this.newThread && latestTag === input.tag) {
      accepted(null);
      this.terminal.resolve(undefined);
      return;
    }
    const context = input.catchUp?.(latestTag) ?? null;
    const result = await this.request(
      'turn/start',
      {
        threadId: this.threadId!,
        clientUserMessageId: input.tag,
        input: [
          ...(context ? [{ type: 'text' as const, text: context, text_elements: [] }] : []),
          { type: 'text', text: input.text, text_elements: [] },
        ],
        ...(input.page
          ? { additionalContext: { prairielearn_page: { kind: 'untrusted', value: input.page } } }
          : {}),
      } satisfies TurnStartParams,
      TurnResult,
    );
    this.turnId = result.turn.id;
    accepted(this.turnId);
  }

  /** The client ID of the thread's most recent user message, read newest first. */
  private async latestClientId() {
    let cursor: string | null = null;
    do {
      const page: z.infer<typeof ItemsPage> = await this.request(
        'thread/items/list',
        {
          threadId: this.threadId!,
          sortDirection: 'desc',
          limit: 50,
          cursor,
        } satisfies ThreadItemsListParams,
        ItemsPage,
      );
      const message = page.data.find((entry) => entry.item.type === 'userMessage');
      if (message) return message.item.clientId ?? null;
      cursor = page.nextCursor;
    } while (cursor);
    return null;
  }

  async interrupt() {
    if (!this.turnId) throw new Error('Native turn acceptance is unknown');
    await this.request(
      'turn/interrupt',
      {
        threadId: this.threadId!,
        turnId: this.turnId,
      } satisfies TurnInterruptParams,
      EmptyResult,
    );
    const timeout = AbortSignal.timeout(30_000);
    const expired = Promise.withResolvers<never>();
    const fail = () => expired.reject(new Error('Native interruption did not settle'));
    timeout.addEventListener('abort', fail, { once: true });
    try {
      await Promise.race([this.terminal.promise, expired.promise]);
    } finally {
      timeout.removeEventListener('abort', fail);
    }
  }

  get finished() {
    return this.terminal.promise;
  }

  private delta(type: 'text' | 'reasoning', params: z.infer<typeof TextDelta>) {
    if (
      params.threadId !== this.threadId ||
      (this.turnId && params.turnId !== this.turnId) ||
      !this.controller
    ) {
      return;
    }
    const id = `${type}:${params.itemId}`;
    if (!this.parts.has(id)) {
      this.parts.set(id, type);
      this.controller.enqueue({ type: type === 'text' ? 'text-start' : 'reasoning-start', id });
    }
    this.controller.enqueue({
      type: type === 'text' ? 'text-delta' : 'reasoning-delta',
      id,
      delta: params.delta,
    });
  }

  /** A tool call's history part, replaced in place when the call completes. */
  private toolCall(phase: 'started' | 'completed', params: z.infer<typeof ItemEvent>) {
    if (params.threadId !== this.threadId || (this.turnId && params.turnId !== this.turnId)) {
      return;
    }
    const card = CardToolItem.safeParse(params.item);
    if (card.success && (phase === 'started' || card.data.success !== false)) return;
    const call = toolCallFromItem(phase, params.item);
    if (!call) return;
    const id = `tool:${params.item.id}`;
    if (phase === 'started') {
      this.runningTools.set(id, call);
      this.emit({ type: 'data-tool', id, data: call });
    } else {
      this.runningTools.delete(id);
      const overBudget = this.toolChars.used + JSON.stringify(call).length > MESSAGE_TOOL_CHARS;
      this.emitFinal(id, overBudget ? toolCallFromItem(phase, params.item, false)! : call);
    }
  }

  /** History keeps a call's final form, so the message's budget counts only these. */
  private emitFinal(id: string, call: ToolCall) {
    this.toolChars.used += JSON.stringify(call).length;
    this.emit({ type: 'data-tool', id, data: call });
  }

  /** Whether chunks still reach the turn's SDK response. */
  get streaming() {
    return this.controller !== null;
  }

  emit(chunk: UIMessageChunk) {
    this.controller?.enqueue(chunk);
  }

  closeStream(error?: unknown) {
    if (error) this.terminal.reject(error);
    if (!this.controller) return;
    for (const [id, type] of this.parts) {
      this.controller.enqueue({ type: type === 'text' ? 'text-end' : 'reasoning-end', id });
    }
    // A call still running here never reports an outcome to this message.
    for (const [id, call] of this.runningTools) {
      this.emitFinal(id, { ...call, status: 'interrupted' });
    }
    this.runningTools.clear();
    if (error) {
      this.controller.enqueue({
        type: 'error',
        errorText: 'The course agent stopped unexpectedly. Resume the conversation to continue.',
      });
    }
    this.controller.enqueue({ type: 'finish' });
    this.controller.close();
    this.controller = null;
    this.parts.clear();
  }

  close() {
    // Forced cleanup must release a turn still waiting for a terminal notification.
    this.terminal.reject(new Error('Native runner was stopped'));
    this.rpc?.dispose();
    this.rpc = null;
  }
}

/** Invalid arguments are the model's mistake, so it gets the reason and can retry. */
function invalidArguments(error: z.ZodError): ToolReply {
  return { success: false, text: `Invalid arguments: ${z.prettifyError(error)}` };
}

/** A failed PrairieLearn request is reported to the model rather than failing the turn. */
async function replyWithError(call: () => Promise<ToolReply>): Promise<ToolReply> {
  try {
    return await call();
  } catch (error) {
    return { success: false, text: error instanceof Error ? error.message : String(error) };
  }
}

/** Codex's tool input schema, generated from the Zod schema that validates the arguments. */
function toolInputSchema(schema: z.ZodType) {
  // Zod types its output with a non-enumerable `~standard` property that serialization drops.
  const { $schema: _schema, ...inputSchema } = z.toJSONSchema(schema);
  return inputSchema as JsonValue;
}

const listCourseDatasetsTool = {
  type: 'function',
  name: 'list_course_datasets',
  description:
    "List the datasets of this course's PrairieLearn data that get_course_data can download, with each column's type and meaning.",
  inputSchema: toolInputSchema(ListCourseDatasetsArguments),
} satisfies DynamicToolSpec;

const courseDataTool = {
  type: 'function',
  name: 'get_course_data',
  description:
    "Download rows of one dataset of this course's PrairieLearn data as a JSONL file in the sandbox, optionally filtered, sorted, and limited. The reply gives the file's path, row count, and columns.",
  inputSchema: toolInputSchema(CourseDataArguments),
} satisfies DynamicToolSpec;

const requestChangesTool = {
  type: 'function',
  name: 'request_changes',
  description:
    'Submit the current course edits for instructor review. Call this as the last step of your turn, after summarizing the changes for staff. If approved, PrairieLearn saves them (pushing to Git when configured) and syncs the course. The decision arrives in a later message; do not push yourself.',
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
} satisfies DynamicToolSpec;

/** The model learns which pages exist from this tool, so the catalog is not repeated in instructions. */
function navigateTool(pages: PageCatalog): DynamicToolSpec {
  const lines = pages.map(({ key, label, params, file }) => {
    const needs = [...params, ...(file ? ['optional file'] : [])];
    return `${key}: ${label}${needs.length > 0 ? ` (${needs.join(', ')})` : ''}`;
  });
  return {
    type: 'function',
    name: 'navigate',
    description: [
      "Open a PrairieLearn page in the instructor's browser, replacing the page they are viewing. Pages, with the names each requires:",
      ...lines,
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: pages.map((page) => page.key) },
        courseInstance: { type: 'string', description: 'Directory name under courseInstances/.' },
        assessment: {
          type: 'string',
          description: "Directory path under the course instance's assessments/.",
        },
        question: { type: 'string', description: 'Directory path under questions/.' },
        file: { type: 'string', description: "Path inside the page's own directory." },
      },
      required: ['page'],
      additionalProperties: false,
    },
  };
}

const refreshPageTool = {
  type: 'function',
  name: 'refresh_page',
  description:
    'Reload the page the instructor is viewing, for example after approved changes were saved and synced so the page shows them.',
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
} satisfies DynamicToolSpec;
