import { type SandboxProcess, getSandbox } from '@cloudflare/sandbox';
import { DurableObject } from 'cloudflare:workers';

import {
  type AgentEventInput,
  type AgentRunStatus,
  AgentRunStatusResponseSchema,
  type AgentToolName,
  AgentToolNameSchema,
  AppendAgentEventsRequestSchema,
  type PublishAgentRunRequest,
  PublishAgentRunRequestSchema,
  type PublishAgentRunResponse,
  type StartAgentRunRequest,
  StartAgentRunRequestSchema,
} from '@prairielearn/agent-protocol';

import { type AgentSandbox, type SandboxRunContext } from './agent-sandbox.js';
import {
  createCommittedQuestionSnapshot,
  createGitCheckpoint,
  currentGitHead,
  loadGitCheckpoint,
  prepareCourseWorkspace,
  pushExactGitHead,
  restoreGitCheckpoint,
} from './git-checkpoints.js';
import { type PublicationRecord, isCurrentRun, publicationReservation } from './run-guards.js';
import {
  deleteConversationSessionStore,
  deleteR2Prefix,
  handleSessionStoreRequest,
} from './session-store.js';

interface AgentWorkerEnv extends Cloudflare.Env {
  AGENT_STATE: R2Bucket;
  GITHUB_WRITE_TOKEN?: string;
  LOCAL_DEVELOPMENT?: string;
  SANDBOX: DurableObjectNamespace<AgentSandbox>;
}

interface StoredRun {
  generation: number;
  request: StartAgentRunRequest;
  capability: string;
  allowedTools: AgentToolName[];
  status: AgentRunStatus;
  sandboxId: string;
  updatedAt: string;
  processId?: string;
  sessionId?: string;
  checkpointKey?: string;
  error?: string;
  terminalAcked?: boolean;
  terminalEvent?: AgentEventInput;
}

interface ConversationMetadata {
  sessionId?: string;
}

interface DeletionCleanup {
  conversationId: string;
  sandboxId: string;
}

type AgentEventDraft = Omit<AgentEventInput, 'event_id'> & { event_id?: string };

const runStateKey = 'run-state';
const conversationMetadataKey = 'conversation-metadata';
const deletionCleanupKey = 'deletion-cleanup';
const harnessConfigPath = '/tmp/prairielearn-agent-run.json';
const harnessCommand = [
  'setpriv',
  '--reuid=prairie-agent',
  '--regid=prairie-agent',
  '--init-groups',
  'node',
  '/opt/prairielearn-agent/harness.mjs',
  harnessConfigPath,
] as const;

export class ConversationCoordinator extends DurableObject<AgentWorkerEnv> {
  private sessionStoreTail: Promise<void> = Promise.resolve();

  async alarm(): Promise<void> {
    const state = await this.ctx.storage.get<StoredRun>(runStateKey);
    if (!state || (await this.ctx.storage.get(deletionCleanupKey))) {
      return;
    }
    if (state.terminalEvent && !state.terminalAcked) {
      await this.deliverTerminalEvent(state);
      return;
    }
    if (state.status !== 'running') return;
    try {
      if (!state.processId) {
        await this.launchTurn(state);
        return;
      }
      const sandbox = getSandbox<AgentSandbox>(this.env.SANDBOX, state.sandboxId);
      const process = await sandbox.getProcess(state.processId);
      if (!process) {
        await this.launchTurn({ ...state, processId: undefined });
        return;
      }
      const status = await process.status();
      if (status.state === 'running') {
        await this.scheduleReconciliation();
        return;
      }
      await this.finalizeTurn(state, process);
    } catch (error) {
      await this.failTurn(state, error);
    }
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/state') {
        const state = await this.ctx.storage.get<StoredRun>(runStateKey);
        const runId = url.searchParams.get('run_id');
        return state && isCurrentRun(state.request.run_id, runId)
          ? Response.json(publicState(state))
          : new Response('Not found', { status: 404 });
      }

      if (request.method === 'GET' && url.pathname === '/checkpoint') {
        const state = await this.ctx.storage.get<StoredRun>(runStateKey);
        const runId = url.searchParams.get('run_id');
        if (!state || !isCurrentRun(state.request.run_id, runId)) {
          return new Response('Not found', { status: 404 });
        }
        const checkpoint = await loadGitCheckpoint(
          this.env.AGENT_STATE,
          state.request.conversation_id,
        );
        return checkpoint
          ? Response.json({ head_sha: checkpoint.headSha })
          : new Response('Not found', { status: 404 });
      }

      if (request.method === 'POST' && url.pathname === '/start') {
        return await this.start(request);
      }

      if (request.method === 'POST' && url.pathname === '/cancel') {
        return await this.cancel(request);
      }

      if (request.method === 'POST' && url.pathname === '/publish') {
        return await this.publish(request);
      }

      if (request.method === 'DELETE' && url.pathname === '/conversation') {
        return await this.deleteConversation();
      }

      if (request.method === 'POST' && url.pathname.startsWith('/internal/session-store/')) {
        const state = await this.requireActiveRun(request.headers.get('x-prairielearn-run-id'));
        return await this.withSessionStoreLock(
          async () =>
            await handleSessionStoreRequest({
              request: new Request(request.url.replace('/internal/session-store', ''), request),
              bucket: this.env.AGENT_STATE,
              storage: this.ctx.storage,
              conversationId: state.request.conversation_id,
            }),
        );
      }

      if (
        request.method === 'POST' &&
        (url.pathname === '/internal/events' || url.pathname === '/internal/events/events')
      ) {
        const events = AppendAgentEventsRequestSchema.parse(await request.json()).events;
        const state = await this.requireActiveRun(request.headers.get('x-prairielearn-run-id'));
        await this.forwardEvents(state, events);
        return Response.json({ accepted: events.length });
      }

      if (request.method === 'POST' && url.pathname === '/internal/render-checkpoint') {
        const state = await this.requireActiveRun(request.headers.get('x-prairielearn-run-id'));
        const body = await parseObject(request);
        if (typeof body.qid !== 'string') throw new Error('render_question qid is missing');
        const existing = await loadGitCheckpoint(
          this.env.AGENT_STATE,
          state.request.conversation_id,
        );
        if (!existing) throw new Error('Git checkpoint is unavailable');
        const sandbox = getSandbox<AgentSandbox>(this.env.SANDBOX, state.sandboxId);
        const snapshot = await createCommittedQuestionSnapshot(sandbox, body.qid);
        const checkpoint = await createGitCheckpoint({
          sandbox,
          bucket: this.env.AGENT_STATE,
          conversationId: state.request.conversation_id,
          branch: existing.branch,
        });
        if (snapshot.headSha !== checkpoint.headSha) {
          throw new Error('Sandbox changed while creating the render checkpoint');
        }
        await this.forwardEvents(state, [
          {
            event_id: `${state.request.run_id}:${state.generation}:render:${checkpoint.headSha}`,
            type: 'checkpoint',
            data: { kind: 'git_render', head_sha: checkpoint.headSha },
          },
        ]);
        return Response.json({
          head_sha: checkpoint.headSha,
          qid: snapshot.qid,
          files: snapshot.files,
        });
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      return Response.json({ error: errorMessage(error) }, { status: 400 });
    }
  }

  private async start(request: Request): Promise<Response> {
    const body = await parseObject(request);
    const runRequest = StartAgentRunRequestSchema.parse(body.request);
    const capability = body.capability;
    if (typeof capability !== 'string' || capability.length === 0) {
      throw new Error('capability must be a non-empty string');
    }
    if (!Array.isArray(body.allowed_tools)) throw new Error('allowed_tools must be an array');
    const allowedTools = body.allowed_tools.map((tool) => AgentToolNameSchema.parse(tool));

    const state = await this.ctx.storage.transaction(async (transaction) => {
      if (await transaction.get(deletionCleanupKey)) {
        throw new Error('Conversation deletion is in progress');
      }
      const current = await transaction.get<StoredRun>(runStateKey);
      if (
        current &&
        (isActive(current.status) || (current.terminalEvent && !current.terminalAcked))
      ) {
        return null;
      }
      const startKey = consumedStartKey(runRequest.run_id);
      if (await transaction.get(startKey)) throw new Error('Run start capability was already used');
      const next: StoredRun = {
        generation: (current?.generation ?? 0) + 1,
        request: runRequest,
        capability,
        allowedTools,
        status: 'running',
        sandboxId: runRequest.conversation_id,
        updatedAt: new Date().toISOString(),
      };
      await transaction.put(startKey, true);
      await transaction.put(runStateKey, next);
      return next;
    });
    if (!state) {
      return Response.json({ error: 'Conversation already has an active turn' }, { status: 409 });
    }

    try {
      await this.launchTurn(state);
    } catch (error) {
      await this.failTurn(state, error);
    }
    const current = await this.ctx.storage.get<StoredRun>(runStateKey);
    return Response.json(publicState(current ?? state), { status: 202 });
  }

  private async launchTurn(initialState: StoredRun): Promise<void> {
    const { request } = initialState;
    const sandbox = getSandbox<AgentSandbox>(this.env.SANDBOX, request.conversation_id);
    await sandbox.setRunContext(runContext(initialState));
    const baseline = await prepareCourseWorkspace({
      sandbox,
      bucket: this.env.AGENT_STATE,
      conversationId: request.conversation_id,
      courseId: request.course_id,
      runId: request.run_id,
      repository: request.repository,
    });
    const permissions = await sandbox.exec([
      'chown',
      '-R',
      'prairie-agent:prairie-agent',
      '/workspace/course',
    ]);
    const permissionsOutput = await permissions.output({ encoding: 'utf8', timeout: 30_000 });
    if (permissionsOutput.exitCode !== 0) {
      throw new Error(`Unable to prepare the agent workspace: ${permissionsOutput.stderr}`);
    }
    await this.forwardEvents(initialState, [
      {
        event_id: `${request.run_id}:${initialState.generation}:started`,
        type: 'run_started',
        data: { sandbox_id: request.conversation_id, restored_head_sha: baseline.headSha },
      },
      {
        event_id: `${request.run_id}:${initialState.generation}:baseline`,
        type: 'checkpoint',
        data: { kind: 'git_baseline', head_sha: baseline.headSha },
      },
    ]);
    const metadata =
      (await this.ctx.storage.get<ConversationMetadata>(conversationMetadataKey)) ?? {};
    await sandbox.writeFile(
      harnessConfigPath,
      JSON.stringify({
        version: 1,
        harness: request.harness,
        conversation_id: request.conversation_id,
        run_id: request.run_id,
        course_id: request.course_id,
        prompt: request.prompt,
        allowed_tools: initialState.allowedTools,
        local_development: this.env.LOCAL_DEVELOPMENT === 'true',
        resume_session_id: metadata.sessionId,
      }),
    );
    const orphan = (await sandbox.listProcesses()).find(
      (candidate) =>
        candidate.state === 'running' &&
        candidate.command.length === harnessCommand.length &&
        candidate.command.every((part, index) => part === harnessCommand[index]),
    );
    if (orphan) {
      await this.putIfCurrent(initialState, { ...initialState, processId: orphan.id });
      await this.scheduleReconciliation();
      return;
    }
    const process = await sandbox.exec(harnessCommand, {
      timeout: request.harness === 'claude' ? 900_000 : 120_000,
    });
    const current = await this.ctx.storage.get<StoredRun>(runStateKey);
    if (!sameRunGeneration(current, initialState) || current.status !== 'running') {
      await process.kill();
      return;
    }
    await this.putIfCurrent(initialState, { ...current, processId: process.id });
    await this.scheduleReconciliation();
  }

  private async finalizeTurn(initialState: StoredRun, process: SandboxProcess): Promise<void> {
    const output = await process.output({ encoding: 'utf8', timeout: 30_000, maxBytes: 5_000_000 });
    if (output.exitCode !== 0) {
      throw new Error(`Agent harness exited with ${output.exitCode}: ${output.stderr}`);
    }
    const harnessResult = parseHarnessResult(output.stdout);
    if (!(await this.isCurrentRunning(initialState))) return;
    const manifest = await loadGitCheckpoint(
      this.env.AGENT_STATE,
      initialState.request.conversation_id,
    );
    if (!manifest) throw new Error('Git checkpoint is unavailable');
    const sandbox = getSandbox<AgentSandbox>(this.env.SANDBOX, initialState.sandboxId);
    const checkpoint = await createGitCheckpoint({
      sandbox,
      bucket: this.env.AGENT_STATE,
      conversationId: initialState.request.conversation_id,
      branch: manifest.branch,
    });
    const checkpointKey = `conversations/${initialState.request.conversation_id}/git/latest.json`;
    await this.forwardEvents(initialState, [
      {
        event_id: `${initialState.request.run_id}:${initialState.generation}:completed-checkpoint:${checkpoint.headSha}`,
        type: 'checkpoint',
        data: { kind: 'git_incremental', head_sha: checkpoint.headSha, key: checkpointKey },
      },
    ]);
    const completed: StoredRun = {
      ...initialState,
      status: 'completed',
      processId: process.id,
      sessionId: harnessResult.sessionId,
      checkpointKey,
      updatedAt: new Date().toISOString(),
      terminalAcked: false,
      terminalEvent: {
        event_id: `${initialState.request.run_id}:${initialState.generation}:completed`,
        type: 'run_completed',
        data: { session_id: harnessResult.sessionId, head_sha: checkpoint.headSha },
      },
    };
    const stored = await this.ctx.storage.transaction(async (transaction) => {
      const current = await transaction.get<StoredRun>(runStateKey);
      if (!sameRunGeneration(current, initialState) || current.status !== 'running') return false;
      await transaction.put(runStateKey, completed);
      await transaction.put(conversationMetadataKey, {
        sessionId: harnessResult.sessionId,
      } satisfies ConversationMetadata);
      return true;
    });
    if (!stored) return;
    await this.deliverTerminalEvent(completed);
  }

  private async failTurn(initialState: StoredRun, error: unknown): Promise<void> {
    const state = await this.ctx.storage.get<StoredRun>(runStateKey);
    if (!sameRunGeneration(state, initialState)) return;
    if (state.status === 'cancelling' || state.status === 'cancelled') {
      await this.finishCancellation(state);
      return;
    }
    const failureCheckpointKey = await this.checkpointEditsBestEffort(state, 'git_failure');
    const failed: StoredRun = {
      ...state,
      status: 'failed',
      error: errorMessage(error),
      checkpointKey: failureCheckpointKey ?? state.checkpointKey,
      updatedAt: new Date().toISOString(),
      terminalAcked: false,
      terminalEvent: {
        event_id: `${state.request.run_id}:${state.generation}:failed`,
        type: 'run_failed',
        data: { error: errorMessage(error) },
      },
    };
    if (await this.putIfCurrent(state, failed)) await this.deliverTerminalEvent(failed);
  }

  private async scheduleReconciliation(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + 1_000);
  }

  private async deliverTerminalEvent(state: StoredRun): Promise<void> {
    if (!state.terminalEvent || state.terminalAcked) return;
    try {
      await this.forwardEvents(state, [state.terminalEvent]);
      await this.putIfCurrent(state, { ...state, terminalAcked: true });
    } catch {
      await this.scheduleReconciliation();
    }
  }

  private async cancel(request: Request): Promise<Response> {
    const body = await parseObject(request);
    const runId = body.run_id;
    if (typeof runId !== 'string') throw new Error('run_id must be a string');
    const state = await this.ctx.storage.get<StoredRun>(runStateKey);
    if (!state || state.request.run_id !== runId) return new Response('Not found', { status: 404 });
    if (!isActive(state.status)) return Response.json(publicState(state));

    const cancelling: StoredRun = {
      ...state,
      status: 'cancelling',
      updatedAt: new Date().toISOString(),
    };
    await this.ctx.storage.put(runStateKey, cancelling);
    if (state.processId) {
      const sandbox = getSandbox<AgentSandbox>(this.env.SANDBOX, state.sandboxId);
      const process = await sandbox.getProcess(state.processId);
      await process?.kill();
    }
    await this.finishCancellation(cancelling);
    return Response.json(publicState({ ...cancelling, status: 'cancelled' }));
  }

  private async finishCancellation(state: StoredRun): Promise<void> {
    if (state.status === 'cancelled') return;
    const cancelled: StoredRun = {
      ...state,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
      terminalAcked: false,
      terminalEvent: {
        event_id: `${state.request.run_id}:${state.generation}:cancelled`,
        type: 'run_cancelled',
        data: {},
      },
    };
    const checkpointKey = await this.checkpointEditsBestEffort(state, 'git_cancelled');
    if (checkpointKey) cancelled.checkpointKey = checkpointKey;
    if (await this.putIfCurrent(state, cancelled)) await this.deliverTerminalEvent(cancelled);
  }

  private async publish(request: Request): Promise<Response> {
    const requestedRunId = new URL(request.url).searchParams.get('run_id');
    const body = await parseObject(request);
    const publishRequest = PublishAgentRunRequestSchema.parse(body.request);
    if (typeof body.jti !== 'string' || body.jti.length === 0) {
      throw new Error('Publication capability JTI is missing');
    }
    const capabilityJti = body.jti;
    const state = await this.ctx.storage.get<StoredRun>(runStateKey);
    if (!state || !isCurrentRun(state.request.run_id, requestedRunId)) {
      return new Response('Not found', { status: 404 });
    }
    if (state.status !== 'completed') {
      return Response.json({ error: 'Run must be complete before publication' }, { status: 409 });
    }
    if (
      state.request.repository &&
      state.request.repository.https_url !== publishRequest.target.https_url
    ) {
      return Response.json(
        { error: 'Publication repository does not match the run' },
        { status: 409 },
      );
    }

    const reservation = await this.reservePublication(publishRequest, capabilityJti);
    if (reservation) return Response.json(reservation);

    const publisherId = await publisherSandboxId(
      state.request.conversation_id,
      publishRequest.operation_id,
    );
    const sandbox = getSandbox<AgentSandbox>(this.env.SANDBOX, publisherId);
    const response: PublishAgentRunResponse = {
      operation_id: publishRequest.operation_id,
      branch: publishRequest.target.branch,
      head_sha: publishRequest.target.head_sha,
    };
    let writeEnabled = false;
    let publicationTargetConfigured = false;
    try {
      const checkpoint = await loadGitCheckpoint(
        this.env.AGENT_STATE,
        state.request.conversation_id,
      );
      if (!checkpoint) throw new Error('Git checkpoint is unavailable for publication');
      await sandbox.setRunContext(runContext(state));
      await restoreGitCheckpoint(sandbox, this.env.AGENT_STATE, checkpoint, {
        courseId: state.request.course_id,
        repository: state.request.repository,
      });
      const localHead = await currentGitHead(sandbox);
      if (localHead !== publishRequest.target.head_sha) {
        throw new Error('Publication HEAD does not match the sandbox');
      }
      if (!isLocalPublication(this.env, publishRequest)) {
        await sandbox.setPublicationTarget(publishRequest.target);
        publicationTargetConfigured = true;
        await sandbox.setOutboundByHost('github.com', 'authenticatedGithubWrite');
        writeEnabled = true;
        await pushExactGitHead(
          sandbox,
          publishRequest.target.https_url,
          publishRequest.target.branch,
          publishRequest.target.head_sha,
        );
      }
      const completed = {
        request: publishRequest,
        status: 'completed',
        response,
      } satisfies PublicationRecord;
      await this.ctx.storage.put({
        [publicationKey(publishRequest.operation_id)]: completed,
        [publicationJtiKey(capabilityJti)]: completed,
      });
      return Response.json(response);
    } catch (error) {
      await this.ctx.storage.put(publicationJtiKey(capabilityJti), {
        request: publishRequest,
        status: 'failed',
        error: errorMessage(error),
      } satisfies PublicationRecord);
      return Response.json({ error: errorMessage(error) }, { status: 409 });
    } finally {
      try {
        if (writeEnabled) {
          await sandbox.removeOutboundByHost('github.com');
        }
        if (publicationTargetConfigured) {
          await sandbox.setPublicationTarget(null);
        }
      } finally {
        await sandbox.destroy();
      }
    }
  }

  private async reservePublication(
    request: PublishAgentRunRequest,
    capabilityJti: string,
  ): Promise<PublishAgentRunResponse | null> {
    return await this.ctx.storage.transaction(async (transaction) => {
      const completed = await transaction.get<PublicationRecord>(
        publicationKey(request.operation_id),
      );
      const completedReservation = publicationReservation(completed, request);
      if (completedReservation.kind === 'replay') return completedReservation.response;

      const jtiKey = publicationJtiKey(capabilityJti);
      const usedJti = await transaction.get<PublicationRecord>(jtiKey);
      const jtiReservation = publicationReservation(usedJti, request);
      if (jtiReservation.kind === 'replay') return jtiReservation.response;
      await transaction.put(jtiKey, { request, status: 'pending' } satisfies PublicationRecord);
      return null;
    });
  }

  private async deleteConversation(): Promise<Response> {
    const state = await this.ctx.storage.get<StoredRun>(runStateKey);
    let cleanup = await this.ctx.storage.get<DeletionCleanup>(deletionCleanupKey);
    if (!cleanup && state) {
      cleanup = {
        conversationId: state.request.conversation_id,
        sandboxId: state.sandboxId,
      };
      await this.ctx.storage.put(deletionCleanupKey, cleanup);
    }
    if (!cleanup) return new Response(null, { status: 204 });
    const cleanupErrors: string[] = [];
    if (state && isActive(state.status)) {
      await this.ctx.storage.put(runStateKey, {
        ...state,
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      } satisfies StoredRun);
      if (state.processId) {
        try {
          const sandbox = getSandbox<AgentSandbox>(this.env.SANDBOX, state.sandboxId);
          await (await sandbox.getProcess(state.processId))?.kill();
        } catch (error) {
          cleanupErrors.push(`process: ${errorMessage(error)}`);
        }
      }
    }
    {
      const sandbox = getSandbox<AgentSandbox>(this.env.SANDBOX, cleanup.sandboxId);
      await cleanupStep('sandbox', cleanupErrors, async () => await sandbox.destroy());
      await cleanupStep(
        'session store',
        cleanupErrors,
        async () =>
          await deleteConversationSessionStore(
            this.env.AGENT_STATE,
            this.ctx.storage,
            cleanup.conversationId,
          ),
      );
      await cleanupStep(
        'conversation objects',
        cleanupErrors,
        async () =>
          await deleteR2Prefix(this.env.AGENT_STATE, `conversations/${cleanup.conversationId}/`),
      );
    }
    if (cleanupErrors.length > 0) {
      return Response.json(
        { error: 'Conversation cleanup was incomplete', details: cleanupErrors },
        { status: 500 },
      );
    }
    await this.ctx.storage.deleteAll();
    return new Response(null, { status: 204 });
  }

  private async forwardEvents(state: StoredRun, events: AgentEventDraft[]): Promise<void> {
    const payload = AppendAgentEventsRequestSchema.parse({
      events: events.map((event) => ({
        event_id: event.event_id ?? crypto.randomUUID(),
        ...event,
      })),
    });
    if (isLocalCallback(this.env, state.request)) {
      const key = `conversations/${state.request.conversation_id}/events/${Date.now().toString().padStart(16, '0')}-${crypto.randomUUID()}.json`;
      await this.env.AGENT_STATE.put(key, JSON.stringify(payload), {
        httpMetadata: { contentType: 'application/json' },
      });
      return;
    }

    const target = new URL(
      `/pl/api/agent/v1/runs/${encodeURIComponent(state.request.run_id)}/events`,
      state.request.prairielearn_base_url,
    );
    let lastError = 'unknown error';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(target, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${state.capability}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (response.ok) return;
        lastError = `HTTP ${response.status}`;
        if (response.status < 500) break;
      } catch (error) {
        lastError = errorMessage(error);
      }
    }
    throw new Error(`PrairieLearn event callback failed: ${lastError}`);
  }

  private async requireActiveRun(expectedRunId: string | null): Promise<StoredRun> {
    const state = await this.ctx.storage.get<StoredRun>(runStateKey);
    if (
      !state ||
      !expectedRunId ||
      state.request.run_id !== expectedRunId ||
      !isActive(state.status)
    ) {
      throw new Error('Run is not active');
    }
    return state;
  }

  private async isCurrentRunning(expected: StoredRun): Promise<boolean> {
    if (await this.ctx.storage.get(deletionCleanupKey)) return false;
    const current = await this.ctx.storage.get<StoredRun>(runStateKey);
    return sameRunGeneration(current, expected) && current.status === 'running';
  }

  private async putIfCurrent(expected: StoredRun, next: StoredRun): Promise<boolean> {
    return await this.ctx.storage.transaction(async (transaction) => {
      if (await transaction.get(deletionCleanupKey)) return false;
      const current = await transaction.get<StoredRun>(runStateKey);
      if (!sameRunGeneration(current, expected)) return false;
      await transaction.put(runStateKey, next);
      return true;
    });
  }

  private async checkpointEditsBestEffort(
    state: StoredRun,
    kind: string,
  ): Promise<string | undefined> {
    try {
      const existing = await loadGitCheckpoint(this.env.AGENT_STATE, state.request.conversation_id);
      if (!existing) return undefined;
      const sandbox = getSandbox<AgentSandbox>(this.env.SANDBOX, state.sandboxId);
      const checkpoint = await createGitCheckpoint({
        sandbox,
        bucket: this.env.AGENT_STATE,
        conversationId: state.request.conversation_id,
        branch: existing.branch,
      });
      const key = `conversations/${state.request.conversation_id}/git/latest.json`;
      await this.forwardEvents(state, [
        {
          event_id: `${state.request.run_id}:${state.generation}:${kind}:${checkpoint.headSha}`,
          type: 'checkpoint',
          data: { kind, head_sha: checkpoint.headSha, key },
        },
      ]);
      return key;
    } catch {
      return undefined;
    }
  }

  private async withSessionStoreLock(callback: () => Promise<Response>): Promise<Response> {
    const result = this.sessionStoreTail.then(callback);
    this.sessionStoreTail = result.then(
      () => undefined,
      () => undefined,
    );
    return await result;
  }
}

function publicState(state: StoredRun) {
  return AgentRunStatusResponseSchema.parse({
    conversation_id: state.request.conversation_id,
    run_id: state.request.run_id,
    status: state.status,
    sandbox_id: state.sandboxId,
    checkpoint_key: state.checkpointKey,
    error: state.error,
  });
}

function runContext(state: StoredRun): SandboxRunContext {
  return {
    conversationId: state.request.conversation_id,
    runId: state.request.run_id,
    courseId: state.request.course_id,
    capability: state.capability,
    prairielearnBaseUrl: state.request.prairielearn_base_url,
    harness: state.request.harness,
    allowedTools: state.allowedTools,
    repository: state.request.repository,
  };
}

function parseHarnessResult(stdout: string): { sessionId: string } {
  const line = stdout.trim().split('\n').at(-1);
  if (!line) throw new Error('Harness returned no result');
  const value: unknown = JSON.parse(line);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('session_id' in value) ||
    typeof value.session_id !== 'string'
  ) {
    throw new Error('Harness returned an invalid session ID');
  }
  return { sessionId: value.session_id };
}

function isActive(status: AgentRunStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'cancelling';
}

function sameRunGeneration(
  current: StoredRun | undefined,
  expected: StoredRun,
): current is StoredRun {
  return (
    current !== undefined &&
    current.generation === expected.generation &&
    current.request.run_id === expected.request.run_id
  );
}

function isLocalCallback(env: AgentWorkerEnv, request: StartAgentRunRequest): boolean {
  return (
    env.LOCAL_DEVELOPMENT === 'true' &&
    new URL(request.prairielearn_base_url).hostname === 'prairielearn-fixture.invalid'
  );
}

function isLocalPublication(env: AgentWorkerEnv, request: PublishAgentRunRequest): boolean {
  return (
    env.LOCAL_DEVELOPMENT === 'true' &&
    new URL(request.target.https_url).hostname === 'local.invalid'
  );
}

function publicationKey(operationId: string): string {
  return `publication:${operationId}`;
}

function publicationJtiKey(jti: string): string {
  return `publication-jti:${jti}`;
}

function consumedStartKey(runId: string): string {
  return `consumed-start:${runId}`;
}

async function parseObject(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function cleanupStep(
  name: string,
  errors: string[],
  callback: () => Promise<void>,
): Promise<void> {
  try {
    await callback();
  } catch (error) {
    errors.push(`${name}: ${errorMessage(error)}`);
  }
}

async function publisherSandboxId(conversationId: string, operationId: string): Promise<string> {
  const input = new TextEncoder().encode(`${conversationId}\0${operationId}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  const hash = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `publisher-${hash.slice(0, 32)}`;
}
