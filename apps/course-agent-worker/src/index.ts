import { Sandbox as BaseSandbox, ContainerProxy, getSandbox } from '@cloudflare/sandbox';

import {
  COURSE_AGENT_SEED_FILE,
  COURSE_AGENT_WORKSPACE_ROOT,
  type CourseAgentConversationState,
  type CourseAgentEvent,
  type CourseAgentInspectCapability,
  type CourseAgentSandboxState,
  CourseAgentSnapshotRequestSchema,
  type CourseAgentStartRunRequest,
  CourseAgentStartRunRequestSchema,
} from '@prairielearn/course-agent-protocol';

import { authorizeRun, authorizeSnapshot } from './auth.js';
import { conversationHistory } from './codex/conversation-history.js';
import { parseCodexLine } from './codex/events.js';
import { codexFailureMessage } from './codex/output.js';
import { CodexStream, type CodexStreamState } from './codex/stream.js';
import {
  ACTIVE_RECHECK_MS,
  SANDBOX_SLEEP_AFTER_SECONDS,
  activeRunExpired,
  idleDeadline,
} from './lifecycle.js';
import { proxyOpenAiRequest } from './provider.js';

/*
 * PL on AWS authorizes instructors; this Worker owns sandbox execution. Signed
 * requests cross that boundary using the shared course-agent-protocol schemas.
 *
 * Cloudflare keeps execution alongside PL's existing infrastructure and provides
 * Durable Objects for coordination, R2 for later workspace backups, and local
 * Docker-based development. The Codex bridge is custom: we do not currently use
 * HarnessAgent, whose Cloudflare integration would need separate validation.
 *
 * One coordinator serializes each conversation's state and event delivery.
 * Codex runs in the container through codex/runner.mjs; codex/stream.ts translates
 * its output. PL filters those events and buffers the UI stream in Redis.
 *
 * This is feature-specific infrastructure, not a template for other PL Workers.
 */
interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  COURSE_AGENT_COORDINATOR: DurableObjectNamespace;
  OPENAI_API_KEY: string;
  COURSE_AGENT_CAPABILITY_SECRET: string;
  OPENAI_MODEL: string;
}

interface ConversationState {
  identity: Pick<
    CourseAgentInspectCapability,
    'userId' | 'courseId' | 'conversationId' | 'sandboxId'
  >;
  activeRunId: string | null;
  activeRunExpiresAt?: string | null;
  status: 'starting' | 'running' | 'waiting_for_user' | 'failed' | 'offline';
  sandboxExpiresAt?: number | null;
  lifecycleVersion?: number;
  conversationState?: CourseAgentConversationState;
  sandboxState?: CourseAgentSandboxState;
  revision?: number;
  sandboxGeneration?: number;
  idleExpiresAt?: number | null;
  runtimeSettings?: CourseAgentStartRunRequest['runtimeSettings'];
  processId?: string | null;
  processStartingUntil?: number | null;
  logCursor?: number;
  codexStream?: CodexStreamState;
  response: string | null;
  error: string | null;
  nextSequence: number;
}

const EVENT_KEY_PREFIX = 'event:';

function eventKey(sequence: number) {
  return `${EVENT_KEY_PREFIX}${sequence.toString().padStart(12, '0')}`;
}

export { ContainerProxy };

export class Sandbox extends BaseSandbox<Env> {
  // Public web access goes through outbound handlers; private networks stay blocked.
  interceptHttps = true;
  enableInternet = false;
  allowedHosts = ['*'];
  deniedHosts = [
    'localhost',
    '*.localhost',
    'host.docker.internal',
    'gateway.docker.internal',
    'metadata.google.internal',
    '0.0.0.0/8',
    '10.0.0.0/8',
    '100.64.0.0/10',
    '127.0.0.0/8',
    '169.254.0.0/16',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '224.0.0.0/4',
    '::1',
    'fc00::/7',
    'fe80::/10',
  ];
}

Sandbox.outbound = async (request: Request) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Public web access is read-only.', { status: 405 });
  }
  const headers = new Headers(request.headers);
  for (const name of ['authorization', 'cookie', 'proxy-authorization', 'x-api-key']) {
    headers.delete(name);
  }
  return fetch(request.url, { method: request.method, headers, redirect: 'manual' });
};

Sandbox.outboundByHost = {
  'api.openai.com': (request: Request, env: Env) => proxyOpenAiRequest(request, env),
};

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Owns run admission, process checkpoints, and event replay for one sandbox.
 * Stored state survives coordinator eviction; this base layer's workspace does
 * not survive sandbox destruction.
 */
export class CourseAgentCoordinator {
  private listeners = new Set<ReadableStreamDefaultController<string>>();
  private monitoring: Promise<void> | null = null;
  private shutdown: Promise<void> | null = null;
  private pollDelayMs = 1000;
  private observedLogLength = 0;

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/run') {
      if (this.shutdown) await this.shutdown;
      const body = CourseAgentStartRunRequestSchema.parse(await request.json());
      const capability = await authorizeRun(body, this.env.COURSE_AGENT_CAPABILITY_SECRET);
      let current = await this.getConversationState();
      if (current && !sameIdentity(current.identity, capability)) {
        return Response.json({ error: 'Sandbox identity mismatch' }, { status: 403 });
      }
      await this.alarm();
      // The alarm can yield or change state, so recheck ownership and run admission together.
      const accepted = await this.state.blockConcurrencyWhile(async () => {
        current = await this.readConversationState();
        if (current && !sameIdentity(current.identity, capability)) return 'identity-mismatch';
        if (current?.activeRunId || current?.sandboxState === 'suspending') return false;
        const next: ConversationState = {
          identity: capability,
          activeRunId: body.runId,
          activeRunExpiresAt: new Date(
            Date.now() + body.runtimeSettings.turnTimeoutSeconds * 1000,
          ).toISOString(),
          status: 'starting',
          response: null,
          error: null,
          nextSequence: current?.nextSequence ?? 0,
          lifecycleVersion: 2,
          conversationState: 'working',
          sandboxState: current?.sandboxState === 'ready' ? 'ready' : 'starting',
          revision: (current?.revision ?? 0) + 1,
          sandboxGeneration: current?.sandboxGeneration ?? 0,
          idleExpiresAt: null,
          runtimeSettings: body.runtimeSettings,
          processId: null,
        };
        await this.state.storage.put('conversation', next);
        await this.state.storage.setAlarm(Date.now() + ACTIVE_RECHECK_MS);
        return true;
      });
      if (accepted === 'identity-mismatch') {
        return Response.json({ error: 'Sandbox identity mismatch' }, { status: 403 });
      }
      if (!accepted) return Response.json({ error: 'A run is already active' }, { status: 409 });
      this.state.waitUntil(this.run(body));
      return Response.json({ accepted: true });
    }
    if (request.method === 'POST' && url.pathname === '/snapshot') {
      const body = CourseAgentSnapshotRequestSchema.parse(await request.json());
      const capability = await authorizeSnapshot(body, this.env.COURSE_AGENT_CAPABILITY_SECRET);
      const current = await this.getConversationState();
      if (!current) return Response.json({ error: 'Conversation not found' }, { status: 404 });
      if (!sameIdentity(current.identity, capability)) {
        return Response.json({ error: 'Sandbox identity mismatch' }, { status: 403 });
      }
      return Response.json({
        conversationId: body.conversationId,
        sandboxId: body.sandboxId,
        activeRunId: current.activeRunId,
        status: current.status,
        conversationState: current.conversationState,
        sandboxState: current.sandboxState,
        revision: current.revision,
        sandboxGeneration: current.sandboxGeneration,
        idleExpiresAt: current.idleExpiresAt ?? null,
        activeRunExpiresAt: current.activeRunExpiresAt ?? null,
        processId: current.processId ?? null,
        response: current.response,
        error: current.error,
        events: await this.getEvents(),
      });
    }
    if (request.method === 'POST' && url.pathname === '/stream') {
      const body = CourseAgentSnapshotRequestSchema.parse(await request.json());
      const capability = await authorizeSnapshot(body, this.env.COURSE_AGENT_CAPABILITY_SECRET);
      // Register the listener with the replay so no event falls between history and live output.
      return this.state.blockConcurrencyWhile(async () => {
        const current = await this.readConversationState();
        if (!current) return Response.json({ error: 'Conversation not found' }, { status: 404 });
        if (!sameIdentity(current.identity, capability)) {
          return Response.json({ error: 'Sandbox identity mismatch' }, { status: 403 });
        }
        return this.stream(current, await this.getEvents());
      });
    }
    return new Response('Not found', { status: 404 });
  }

  async alarm() {
    // Alarms recover monitoring after eviction as well as enforcing idle shutdown.
    const current = await this.getConversationState();
    if (!current || current.sandboxState === 'offline') return;
    if (current.activeRunId) {
      await this.state.storage.setAlarm(Date.now() + ACTIVE_RECHECK_MS);
      await this.monitorRun();
      return;
    }
    if (this.shutdown) return this.shutdown;
    this.shutdown = this.suspendWorkspace();
    try {
      await this.shutdown;
    } finally {
      this.shutdown = null;
    }
  }

  private async suspendWorkspace() {
    const suspended = await this.state.blockConcurrencyWhile(async () => {
      const current = await this.readConversationState();
      if (!current || current.activeRunId || current.sandboxState === 'offline') return null;
      if (current.idleExpiresAt == null) return null;
      if (current.idleExpiresAt > Date.now()) {
        await this.state.storage.setAlarm(current.idleExpiresAt);
        return null;
      }
      const next: ConversationState = {
        ...current,
        sandboxState: 'suspending',
        revision: (current.revision ?? 0) + 1,
      };
      await this.state.storage.put('conversation', next);
      return next;
    });
    if (!suspended) return;
    const sandbox = getSandbox(this.env.Sandbox, suspended.identity.sandboxId, {
      normalizeId: true,
      keepAlive: false,
    });
    // Leave a retry alarm in storage before making an external call.
    await this.state.storage.setAlarm(Date.now() + ACTIVE_RECHECK_MS);
    await sandbox.destroy();
    await this.update({ sandboxState: 'offline', status: 'offline', idleExpiresAt: null });
    await this.append('sandbox.destroyed', { reason: 'idle_timeout' });
    await this.state.storage.deleteAlarm();
    this.closeStreams();
  }

  private async append(
    type: CourseAgentEvent['type'],
    data: Record<string, unknown> = {},
    runId?: string,
  ) {
    await this.state.blockConcurrencyWhile(async () => {
      const current = await this.state.storage.get<ConversationState>('conversation');
      if (!current || (runId && current.activeRunId !== runId)) return;
      const event = {
        sequence: current.nextSequence,
        type,
        occurredAt: new Date().toISOString(),
        data,
      } satisfies CourseAgentEvent;
      current.nextSequence++;
      await this.putStateAndEvents(current, [event]);
      const chunk = eventChunk(event);
      for (const listener of this.listeners) listener.enqueue(chunk);
    });
  }

  private closeStreams() {
    for (const listener of this.listeners) listener.close();
    this.listeners.clear();
  }

  private stream(current: ConversationState, events: CourseAgentEvent[]) {
    const listeners = this.listeners;
    let activeController: ReadableStreamDefaultController<string> | null = null;
    return new Response(
      new ReadableStream<string>({
        start(controller) {
          for (const event of events) controller.enqueue(eventChunk(event));
          if (!current.activeRunId) {
            controller.close();
            return;
          }
          activeController = controller;
          listeners.add(controller);
        },
        cancel() {
          if (activeController) listeners.delete(activeController);
        },
      }).pipeThrough(new TextEncoderStream()),
      {
        headers: {
          'Cache-Control': 'no-cache, no-transform',
          'Content-Type': 'text/event-stream',
          'X-Accel-Buffering': 'no',
        },
      },
    );
  }

  private async run(request: CourseAgentStartRunRequest) {
    const sandbox = getSandbox(this.env.Sandbox, request.sandboxId, {
      normalizeId: true,
      labels: { courseId: 'redacted', workload: 'course-agent' },
      keepAlive: false,
      sleepAfter: request.runtimeSettings.sleepAfterSeconds,
    });
    try {
      const sandboxState = await sandbox.getState();
      const starting = !['running', 'healthy'].includes(sandboxState.status);
      const current = await this.state.storage.get<ConversationState>('conversation');
      if (current?.activeRunId !== request.runId) return;
      const previousEvents = await this.getEvents();
      await this.update(
        {
          sandboxState: starting ? 'starting' : 'ready',
          sandboxGeneration: (current.sandboxGeneration ?? 0) + Number(starting),
        },
        request.runId,
      );
      await this.append(
        'user.message',
        { text: request.prompt, runId: request.runId },
        request.runId,
      );
      if (starting) await this.append('sandbox.starting', { restoring: false }, request.runId);
      const seed = [
        '# PrairieLearn course-agent workspace',
        '',
        'This ephemeral workspace is reused only while this sandbox remains alive.',
        '',
      ].join('\n');
      const result = await sandbox.exec(
        `mkdir -p ${shellQuote(COURSE_AGENT_WORKSPACE_ROOT)} && test -f ${shellQuote(COURSE_AGENT_SEED_FILE)} || printf %s ${shellQuote(seed)} > ${shellQuote(COURSE_AGENT_SEED_FILE)}`,
      );
      if (!result.success) throw new Error(result.stderr || 'Could not create workspace');
      if (starting) {
        await this.append(
          'sandbox.ready',
          { workspacePath: COURSE_AGENT_WORKSPACE_ROOT },
          request.runId,
        );
      }
      if (!(await this.update({ status: 'running', sandboxState: 'ready' }, request.runId))) return;
      await this.append(
        'agent.started',
        { model: this.env.OPENAI_MODEL, harness: 'codex' },
        request.runId,
      );

      const requestPath = `${COURSE_AGENT_WORKSPACE_ROOT}/.course-agent-request.json`;
      // Use a file rather than shell arguments: recovery history may exceed the argument-size limit.
      await sandbox.writeFile(
        requestPath,
        JSON.stringify({
          prompt: request.prompt,
          history: conversationHistory(previousEvents),
        }),
      );
      const command = [
        'node /opt/course-agent/run-codex.mjs',
        shellQuote(this.env.OPENAI_MODEL),
        shellQuote(requestPath),
      ].join(' ');
      const processId = `course-agent-${request.runId}`;
      if (
        !(await this.update(
          { processId, processStartingUntil: Date.now() + ACTIVE_RECHECK_MS },
          request.runId,
        ))
      ) {
        return;
      }
      await sandbox.startProcess(command, {
        cwd: COURSE_AGENT_WORKSPACE_ROOT,
        processId,
        autoCleanup: false,
        env: { OPENAI_API_KEY: 'proxy-injected', IS_SANDBOX: '1' },
      });
      await this.update({ processStartingUntil: null }, request.runId);
      this.pollDelayMs = 1000;
      this.observedLogLength = 0;
      while ((await this.getConversationState())?.activeRunId === request.runId) {
        await this.monitorRun();
        await new Promise((resolve) => setTimeout(resolve, this.pollDelayMs));
      }
    } catch (error) {
      const current = await this.getConversationState();
      if (current?.activeRunId === request.runId && current.processId) {
        const process = await sandbox.getProcess(current.processId);
        if (process && !['completed', 'failed', 'killed', 'error'].includes(process.status)) {
          await sandbox.killProcess(current.processId);
        }
      }
      await this.failRun(request.runId, error);
    }
  }

  private async monitorRun() {
    if (this.monitoring) return this.monitoring;
    this.monitoring = this.pollProcess();
    try {
      await this.monitoring;
    } finally {
      this.monitoring = null;
    }
  }

  private async pollProcess() {
    // Resume monitoring the recorded process, not the prompt: resubmitting could repeat file edits.
    const current = await this.getConversationState();
    if (!current?.activeRunId) return;
    const runId = current.activeRunId;
    const sandbox = getSandbox(this.env.Sandbox, current.identity.sandboxId, {
      normalizeId: true,
      keepAlive: false,
      sleepAfter: current.runtimeSettings?.sleepAfterSeconds ?? SANDBOX_SLEEP_AFTER_SECONDS,
    });
    try {
      const process = current.processId ? await sandbox.getProcess(current.processId) : null;
      const finished =
        !!process && ['completed', 'failed', 'killed', 'error'].includes(process.status);
      if (activeRunExpired(current.activeRunExpiresAt) && !finished) {
        if (current.processId) await sandbox.killProcess(current.processId);
        await this.failRun(runId, new Error('The course-agent active execution limit was reached'));
        return;
      }
      if (!current.processId) return;
      if (!process) {
        if ((current.processStartingUntil ?? 0) > Date.now()) return;
        await this.failRun(runId, new Error('The course-agent process is no longer available'));
        return;
      }
      const logs = await sandbox.getProcessLogs(current.processId);
      const previousCursor = current.logCursor ?? 0;
      if (logs.stdout.length < previousCursor) throw new Error('Codex process logs were truncated');
      // Keep partial JSON lines for the next poll; drain the final line when the process exits.
      const logCursor = finished ? logs.stdout.length : logs.stdout.lastIndexOf('\n') + 1;
      // The SDK log stream has no resume offset. Keep recoverable polling, but back off
      // quiet processes and avoid rewriting the checkpoint when no complete line arrived.
      this.pollDelayMs =
        logs.stdout.length === this.observedLogLength ? Math.min(this.pollDelayMs * 2, 8000) : 1000;
      this.observedLogLength = logs.stdout.length;
      if (!finished && logCursor === previousCursor) return;
      const stream = new CodexStream(current.codexStream);
      const events: Pick<CourseAgentEvent, 'type' | 'data'>[] = [];
      for (const line of logs.stdout.slice(previousCursor, logCursor).split('\n')) {
        if (!line.trim()) continue;
        const event = parseCodexLine(line);
        if (!event) throw new Error('Codex returned a malformed notification');
        events.push(...stream.consume(event));
      }
      if (finished) {
        if (process.status !== 'completed' || process.exitCode !== 0) {
          throw new Error(codexFailureMessage(logs.stdout, logs.stderr));
        }
        if (!stream.completed || !stream.response.trim()) {
          throw new Error('The agent finished without a complete response. Please try again.');
        }
        events.push({ type: 'agent.completed', data: { response: stream.response } });
      }
      await this.state.blockConcurrencyWhile(async () => {
        const latest = await this.readConversationState();
        // Another monitor may have consumed these logs while the sandbox calls were in flight.
        if (latest?.activeRunId !== runId || (latest.logCursor ?? 0) !== previousCursor) return;
        const next: ConversationState = {
          ...latest,
          logCursor,
          codexStream: stream.snapshot(),
          revision: (latest.revision ?? 0) + 1,
          ...(finished
            ? {
                activeRunId: null,
                activeRunExpiresAt: null,
                processId: null,
                conversationState: 'waiting_for_user',
                status: 'waiting_for_user',
                response: stream.response,
                error: null,
                idleExpiresAt: idleDeadline(latest.runtimeSettings?.idleTimeoutSeconds ?? 600),
              }
            : {}),
        };
        const persisted = events.map((event) => ({
          ...event,
          sequence: next.nextSequence++,
          occurredAt: new Date().toISOString(),
        }));
        // Checkpoint parser state, cursor, and events together before making output visible.
        await this.putStateAndEvents(next, persisted);
        await this.state.storage.setAlarm(next.idleExpiresAt ?? Date.now() + ACTIVE_RECHECK_MS);
        for (const event of persisted) {
          for (const listener of this.listeners) listener.enqueue(eventChunk(event));
        }
        // Close under the same lock so a new run's subscribers cannot be closed by this run.
        if (finished) this.closeStreams();
      });
      if (finished) {
        await this.pruneCompletedDeltas(runId);
      }
    } catch (error) {
      // Do not declare a run idle while its process could still be editing files.
      if (current.processId) {
        const process = await sandbox.getProcess(current.processId);
        if (process && !['completed', 'failed', 'killed', 'error'].includes(process.status)) {
          await sandbox.killProcess(current.processId);
        }
      }
      await this.failRun(runId, error);
    }
  }

  private async failRun(runId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.append('run.failed', { message }, runId);
    const current = await this.getConversationState();
    if (current?.activeRunId !== runId) return;
    const idleExpiresAt = idleDeadline(current.runtimeSettings?.idleTimeoutSeconds ?? 600);
    await this.update(
      {
        activeRunId: null,
        activeRunExpiresAt: null,
        processId: null,
        status: 'failed',
        conversationState: 'failed',
        response: null,
        error: message,
        idleExpiresAt,
      },
      runId,
    );
  }

  private async getConversationState() {
    return this.state.blockConcurrencyWhile(() => this.readConversationState());
  }

  private async readConversationState() {
    const current = await this.state.storage.get<ConversationState>('conversation');
    if (!current || current.lifecycleVersion === 2) return current;
    // Ignore the old absolute deadline. Existing idle workspaces get a full idle interval.
    const migrated: ConversationState = {
      ...current,
      lifecycleVersion: 2,
      conversationState: current.activeRunId
        ? 'working'
        : current.status === 'failed'
          ? 'failed'
          : 'waiting_for_user',
      sandboxState:
        current.status === 'offline'
          ? 'offline'
          : current.status === 'starting'
            ? 'starting'
            : 'ready',
      revision: 1,
      sandboxGeneration: current.status === 'offline' ? 0 : 1,
      idleExpiresAt:
        current.activeRunId || current.status === 'offline'
          ? null
          : idleDeadline(current.runtimeSettings?.idleTimeoutSeconds ?? 600),
      sandboxExpiresAt: null,
    };
    await this.state.storage.put('conversation', migrated);
    if (migrated.sandboxState !== 'offline') {
      await this.state.storage.setAlarm(migrated.idleExpiresAt ?? Date.now() + ACTIVE_RECHECK_MS);
    }
    return migrated;
  }

  private async update(update: Partial<ConversationState>, runId?: string) {
    return this.state.blockConcurrencyWhile(async () => {
      const current = await this.state.storage.get<ConversationState>('conversation');
      if (!current || (runId && current.activeRunId !== runId)) return false;
      const next = {
        ...current,
        ...update,
        revision: (current.revision ?? 0) + 1,
      };
      const changed =
        current.conversationState !== next.conversationState ||
        current.sandboxState !== next.sandboxState;
      const events: CourseAgentEvent[] = changed
        ? [
            {
              sequence: next.nextSequence++,
              type: 'state.changed',
              occurredAt: new Date().toISOString(),
              data: {
                conversationState: next.conversationState,
                sandboxState: next.sandboxState,
                revision: next.revision,
              },
            },
          ]
        : [];
      await this.putStateAndEvents(next, events);
      for (const event of events) {
        for (const listener of this.listeners) listener.enqueue(eventChunk(event));
      }
      if (current.activeRunId && next.activeRunId === null) {
        await this.state.storage.setAlarm(next.idleExpiresAt ?? Date.now() + ACTIVE_RECHECK_MS);
        this.closeStreams();
      }
      return true;
    });
  }

  private async getEvents() {
    const events = await this.state.storage.list<CourseAgentEvent>({ prefix: EVENT_KEY_PREFIX });
    return [...events.values()].sort((left, right) => left.sequence - right.sequence);
  }

  private async putStateAndEvents(state: ConversationState, events: CourseAgentEvent[]) {
    await this.state.storage.put({
      conversation: state,
      ...Object.fromEntries(events.map((event) => [eventKey(event.sequence), event])),
    });
  }

  private async pruneCompletedDeltas(runId: string) {
    const events = await this.state.storage.list<CourseAgentEvent>({ prefix: EVENT_KEY_PREFIX });
    const runEvents = [...events];
    const startSequence = runEvents.find(
      ([, event]) => event.type === 'user.message' && event.data.runId === runId,
    )?.[1].sequence;
    const endSequence = runEvents.find(
      ([, event]) =>
        event.type === 'agent.completed' && startSequence != null && event.sequence > startSequence,
    )?.[1].sequence;
    if (startSequence == null || endSequence == null) return;
    const deltaKeys = runEvents
      .filter(
        ([, event]) =>
          event.type === 'assistant.delta' &&
          event.sequence > startSequence &&
          event.sequence < endSequence,
      )
      .map(([key]) => key);
    if (deltaKeys.length > 0) await this.state.storage.delete(deltaKeys);
  }
}

function sameIdentity(left: ConversationState['identity'], right: ConversationState['identity']) {
  return (
    left.userId === right.userId &&
    left.courseId === right.courseId &&
    left.conversationId === right.conversationId &&
    left.sandboxId === right.sandboxId
  );
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/health') {
        return Response.json({ ok: true, runtime: 'cloudflare-sandbox' });
      }
      if (request.method === 'POST' && url.pathname === '/v1/runs') {
        const body = CourseAgentStartRunRequestSchema.parse(await request.json());
        await authorizeRun(body, env.COURSE_AGENT_CAPABILITY_SECRET);
        const response = await coordinatorFetch(env, body.sandboxId, '/run', body);
        if (!response.ok) return response;
        return Response.json({
          accepted: true,
          conversationId: body.conversationId,
          runId: body.runId,
          sandboxId: body.sandboxId,
        });
      }
      if (request.method === 'POST' && url.pathname === '/v1/snapshot') {
        const body = CourseAgentSnapshotRequestSchema.parse(await request.json());
        await authorizeSnapshot(body, env.COURSE_AGENT_CAPABILITY_SECRET);
        return coordinatorFetch(env, body.sandboxId, '/snapshot', body);
      }
      if (request.method === 'POST' && url.pathname === '/v1/stream') {
        const body = CourseAgentSnapshotRequestSchema.parse(await request.json());
        await authorizeSnapshot(body, env.COURSE_AGENT_CAPABILITY_SECRET);
        return coordinatorFetch(env, body.sandboxId, '/stream', body);
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      );
    }
  },
};

function eventChunk(event: CourseAgentEvent) {
  return `id: ${event.sequence}\nevent: course-agent\ndata: ${JSON.stringify(event)}\n\n`;
}

function coordinatorFetch(env: Env, sandboxId: string, path: string, body: unknown) {
  const id = env.COURSE_AGENT_COORDINATOR.idFromName(sandboxId);
  return env.COURSE_AGENT_COORDINATOR.get(id).fetch(
    new Request(`https://coordinator${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}
