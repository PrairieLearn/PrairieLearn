import { randomUUID } from 'node:crypto';

import type { z } from 'zod';

import {
  type CourseAgentEvent,
  type CourseAgentPushDecisionRequestSchema,
  CourseAgentSnapshotSchema,
  type CourseAgentStartRunRequest,
} from '@prairielearn/course-agent-protocol';

import type { DriverFactory, DriverSession } from './driver.ts';
import { type State, type StateStore } from './state.ts';

interface Identity {
  userId: string;
  courseId: string;
  conversationId: string;
  sandboxId: string;
}
type Decision = z.infer<typeof CourseAgentPushDecisionRequestSchema>;

export class Runtime {
  private readonly states = new Map<string, State>();
  private readonly tasks = new Map<string, Promise<void>>();
  private readonly sessions = new Map<string, DriverSession>();
  private readonly gates = new Map<string, Promise<unknown>>();

  readonly store: StateStore;
  private readonly driver: DriverFactory;
  private readonly secrets: string[];

  constructor(store: StateStore, driver: DriverFactory, secrets: string[] = []) {
    this.store = store;
    this.driver = driver;
    this.secrets = secrets;
  }

  async initialize() {
    for (const state of await this.store.list()) {
      this.states.set(state.request.conversationId, state);
      if (
        state.snapshot.activeRunId &&
        (!state.pendingToolId || state.continuationDelivered === state.snapshot.pendingApproval?.id)
      ) {
        await this.fail(
          state,
          new Error(
            'The prototype runtime restarted during execution. Your last saved workspace remains available. Send another message to continue; the interrupted prompt was not replayed.',
          ),
        );
      }
    }
  }

  private message(error: unknown) {
    let message =
      error instanceof Error ? error.message : 'The agent could not complete this operation.';
    for (const secret of this.secrets.filter(Boolean)) {
      message = message.replaceAll(secret, '[redacted]');
    }
    return message.slice(0, 12_000);
  }

  private async exclusive<T>(id: string, operation: () => Promise<T>) {
    const previous = this.gates.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.gates.set(id, next);
    try {
      return await next;
    } finally {
      if (this.gates.get(id) === next) this.gates.delete(id);
    }
  }

  private assertIdentity(identity: Identity) {
    const state = this.states.get(identity.conversationId);
    if (
      !state ||
      state.userId !== identity.userId ||
      state.courseId !== identity.courseId ||
      state.request.sandboxId !== identity.sandboxId
    ) {
      throw new Error('The course-agent conversation is unavailable.');
    }
    return state;
  }

  private async append(
    state: State,
    type: CourseAgentEvent['type'],
    data: Record<string, unknown> = {},
  ) {
    state.snapshot.events.push({
      sequence: state.snapshot.events.length,
      type,
      data,
      occurredAt: new Date().toISOString(),
    });
    state.snapshot.revision++;
    await this.store.save(state);
  }

  private async fail(state: State, error: unknown) {
    const message = this.message(error);
    state.snapshot.activeRunId = null;
    state.snapshot.status = 'failed';
    state.snapshot.conversationState = 'failed';
    state.snapshot.error = message;
    await this.append(state, 'run.failed', { message });
  }

  async start(
    request: CourseAgentStartRunRequest,
    identity: Pick<Identity, 'userId' | 'courseId'>,
  ) {
    return this.exclusive(request.conversationId, async () => {
      const previous = this.states.get(request.conversationId);
      if (!previous && request.workspaceBackup) {
        throw new Error('The local runtime session state is missing. Start a new conversation.');
      }
      if (previous) {
        this.assertIdentity({
          ...identity,
          conversationId: request.conversationId,
          sandboxId: request.sandboxId,
        });
      }
      if (previous?.request.runId === request.runId) return this.accepted(request);
      if (
        previous?.pendingToolId &&
        previous.continuationDelivered === previous.snapshot.pendingApproval?.id
      ) {
        throw new Error(
          'This prototype was interrupted while continuing an approval. Start a new conversation and inspect the recorded publication result before retrying changes.',
        );
      }
      if (previous?.snapshot.activeRunId || this.tasks.has(request.conversationId)) {
        throw new Error('A course-agent run is already active.');
      }
      if (
        previous &&
        (previous.request.course.repository !== request.course.repository ||
          previous.request.course.branch !== request.course.branch)
      ) {
        throw new Error('The configured course repository changed. Start a new conversation.');
      }
      if (
        previous?.snapshot.workspaceBackup &&
        Date.parse(previous.snapshot.workspaceBackup.expiresAt) <= Date.now()
      ) {
        throw new Error(
          'This workspace backup expired. Start a new conversation; unpublished files cannot be promised restored.',
        );
      }
      const state: State = previous ?? {
        ...identity,
        request,
        resume: null,
        pendingToolId: null,
        continuationDelivered: null,
        snapshot: CourseAgentSnapshotSchema.parse({
          conversationId: request.conversationId,
          sandboxId: request.sandboxId,
          activeRunId: request.runId,
          status: 'starting',
          response: null,
          error: null,
          events: [],
        }),
      };
      state.request = request;
      state.snapshot.activeRunId = request.runId;
      state.snapshot.status = 'starting';
      state.snapshot.conversationState = 'working';
      state.snapshot.response = '';
      state.snapshot.error = null;
      state.snapshot.pendingApproval = null;
      state.pendingToolId = null;
      this.states.set(request.conversationId, state);
      await this.append(state, 'user.message', { text: request.prompt, runId: request.runId });
      this.launch(state, { prompt: request.prompt });
      return this.accepted(request);
    });
  }

  private accepted(request: CourseAgentStartRunRequest) {
    return {
      accepted: true as const,
      conversationId: request.conversationId,
      sandboxId: request.sandboxId,
      runId: request.runId,
    };
  }

  snapshot(identity: Identity) {
    return structuredClone(this.assertIdentity(identity).snapshot);
  }

  private launch(
    state: State,
    input: { prompt: string } | { toolCallId: string; output: Record<string, unknown> },
  ) {
    const id = state.request.conversationId;
    const task = this.execute(state, input)
      .catch(async (error: unknown) => {
        const session = this.sessions.get(id);
        if (session) await session.interrupt().catch(() => {});
        await this.fail(state, error);
      })
      .finally(() => {
        this.sessions.delete(id);
        this.tasks.delete(id);
      });
    this.tasks.set(id, task);
  }

  private async execute(
    state: State,
    input: { prompt: string } | { toolCallId: string; output: Record<string, unknown> },
  ) {
    state.snapshot.sandboxState = 'starting';
    await this.append(state, 'sandbox.starting', { restoring: state.resume !== null });
    const session = await this.driver(state);
    this.sessions.set(state.request.conversationId, session);
    state.snapshot.sandboxGeneration++;
    state.snapshot.sandboxState = 'ready';
    state.snapshot.status = 'running';
    state.snapshot.conversationState = 'working';
    await this.append(state, 'sandbox.ready');
    await this.append(state, 'agent.started');
    if ('toolCallId' in input && input.output.published === true) {
      try {
        await session.refresh();
      } catch (error) {
        const message = this.message(error);
        input = { ...input, output: { ...input.output, workspaceRefreshError: message } };
        await this.append(state, 'validation.failed', { message });
      }
    }
    let nextInput = input;
    for (;;) {
      let requestedTool: string | null = null;
      for await (const part of session.stream(nextInput)) {
        if (part.type === 'text') {
          state.snapshot.response = (state.snapshot.response ?? '') + part.text;
          await this.append(state, 'assistant.delta', { text: part.text });
        } else if (part.type === 'tool-start' || part.type === 'tool-end') {
          await this.append(
            state,
            part.type === 'tool-start'
              ? 'tool.started'
              : part.failed
                ? 'tool.failed'
                : 'tool.completed',
            { operationId: part.id, label: part.label },
          );
        } else if (part.type === 'publish') {
          requestedTool = part.id;
        }
      }
      if (!requestedTool) break;
      let proposal;
      try {
        proposal = await session.proposal();
      } catch (error) {
        nextInput = {
          toolCallId: requestedTool,
          output: { published: false, message: this.message(error) },
        };
        await this.append(state, 'validation.failed', { message: this.message(error) });
        continue;
      }
      state.snapshot.conversationState = 'validating_change';
      await this.checkpoint(state, session);
      state.pendingToolId = requestedTool;
      state.snapshot.pendingApproval = {
        ...proposal,
        id: randomUUID(),
        status: 'pending',
        result: null,
      };
      await this.append(state, 'git.push.approval.requested', {
        approvalId: state.snapshot.pendingApproval.id,
      });
      return;
    }
    await this.checkpoint(state, session);
    state.pendingToolId = null;
    state.snapshot.activeRunId = null;
    state.snapshot.status = 'waiting_for_user';
    state.snapshot.conversationState = 'waiting_for_user';
    await this.append(state, 'agent.completed', { response: state.snapshot.response ?? '' });
  }

  private async checkpoint(state: State, session: DriverSession) {
    state.snapshot.sandboxState = 'suspending';
    await this.append(state, 'workspace.backup.started');
    const checkpoint = await session.checkpoint();
    state.resume = checkpoint.resume;
    state.snapshot.workspaceBackup = {
      handle: { id: checkpoint.snapshotId, dir: '/vercel/sandbox' },
      expiresAt: new Date(
        Date.now() + state.request.runtimeSettings.backupTtlSeconds * 1000,
      ).toISOString(),
    };
    state.snapshot.sandboxState = 'offline';
    state.snapshot.shutdownReason = 'Saved between turns';
    await this.append(state, 'workspace.backup.completed', { backupId: checkpoint.snapshotId });
  }

  async decision(request: Decision, identity: Pick<Identity, 'userId' | 'courseId'>) {
    return this.exclusive(request.conversationId, async () => {
      const state = this.assertIdentity({
        ...identity,
        conversationId: request.conversationId,
        sandboxId: request.sandboxId,
      });
      const approval = state.snapshot.pendingApproval;
      if (!approval || approval.id !== request.approvalId) {
        throw new Error('The approval is unavailable.');
      }
      if (state.continuationDelivered === request.approvalId) return { accepted: true as const };
      const expired =
        state.snapshot.workspaceBackup &&
        Date.parse(state.snapshot.workspaceBackup.expiresAt) <= Date.now();
      if (request.decision === 'pending') {
        if (approval.status === 'pending') {
          state.snapshot.conversationState = 'waiting_for_approval';
        }
        await this.append(state, 'state.changed');
        return { accepted: true as const };
      }
      if (request.decision === 'publishing') {
        approval.status = 'publishing';
        state.snapshot.conversationState = request.phase === 'syncing' ? 'syncing' : 'publishing';
        await this.append(state, 'state.changed');
        return { accepted: true as const };
      }
      if (!state.pendingToolId || !state.resume) {
        throw new Error('This approval can no longer resume its tool call.');
      }
      if (this.tasks.has(request.conversationId)) {
        throw new Error('The agent is still saving its proposal. Retry the decision.');
      }
      const output = {
        ...request.result,
        published: request.decision === 'completed' || request.result?.published === true,
        decision: request.decision,
      };
      approval.status = request.decision;
      approval.result = output;
      state.continuationDelivered = request.approvalId;
      state.snapshot.conversationState = 'resuming_agent';
      await this.store.save(state);
      if (request.decision === 'denied') {
        await this.append(state, 'git.push.approval.denied', { approvalId: approval.id });
      }
      if (output.published) {
        await this.append(state, 'git.push.completed', { approvalId: approval.id, ...output });
      }
      if (request.decision === 'completed') {
        await this.append(state, 'sync.completed', { approvalId: approval.id, ...output });
      }
      if (expired) {
        await this.fail(
          state,
          new Error(
            'The publication decision was recorded, but the saved workspace expired before the agent could continue. Start a new conversation.',
          ),
        );
      } else {
        this.launch(state, { toolCallId: state.pendingToolId, output });
      }
      return { accepted: true as const };
    });
  }

  async settled(conversationId: string) {
    await this.tasks.get(conversationId);
  }

  async shutdown() {
    await Promise.allSettled([...this.sessions.values()].map((session) => session.interrupt()));
    await Promise.allSettled(this.tasks.values());
  }
}
