import { ContainerProxy, Sandbox } from '@cloudflare/sandbox';

import {
  type AgentHarness,
  type AgentPublicationTarget,
  type AgentRepository,
  type AgentToolName,
  AgentToolNameSchema,
  AgentToolRequestSchema,
  AppendAgentEventsRequestSchema,
} from '@prairielearn/agent-protocol';

import { isGitReadRequest } from './git-auth.js';

export { ContainerProxy };

export interface SandboxRunContext {
  conversationId: string;
  runId: string;
  courseId: string;
  capability: string;
  prairielearnBaseUrl: string;
  harness: AgentHarness;
  allowedTools: AgentToolName[];
  repository?: AgentRepository;
  publicationTarget?: AgentPublicationTarget;
}

interface AgentSandboxEnv extends Cloudflare.Env {
  ANTHROPIC_API_KEY?: string;
  GITHUB_READ_TOKEN?: string;
  GITHUB_WRITE_TOKEN?: string;
  LOCAL_DEVELOPMENT?: string;
  SANDBOX: DurableObjectNamespace<AgentSandbox>;
}

const runContextStorageKey = 'agent-run-context';

export class AgentSandbox extends Sandbox<AgentSandboxEnv> {
  enableInternet = false;
  allowedHosts = [
    'api.anthropic.com',
    'github.com',
    'prairielearn.internal',
    'session-store.internal',
    'worker-events.internal',
  ];

  async setRunContext(context: SandboxRunContext): Promise<void> {
    await this.ctx.storage.put(runContextStorageKey, context);
  }

  async getRunContext(): Promise<SandboxRunContext | null> {
    return (await this.ctx.storage.get<SandboxRunContext>(runContextStorageKey)) ?? null;
  }

  async setPublicationTarget(target: AgentPublicationTarget | null): Promise<void> {
    const context = await this.getRunContext();
    if (!context) throw new Error('Sandbox run context is not configured');
    if (target) {
      await this.setRunContext({ ...context, publicationTarget: target });
    } else {
      const next = { ...context };
      delete next.publicationTarget;
      await this.setRunContext(next);
    }
  }
}

AgentSandbox.outboundByHost = {
  'api.anthropic.com': async (
    request: Request,
    env: AgentSandboxEnv,
    handlerContext: { containerId: string },
  ) => {
    const context = await getRunContext(env, handlerContext.containerId);
    if (context.harness !== 'claude' || !env.ANTHROPIC_API_KEY) {
      return new Response('Anthropic access is not configured for this run', { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.set('x-api-key', env.ANTHROPIC_API_KEY);
    return await fetch(new Request(forceHttps(request), { headers }));
  },
  'github.com': async (
    request: Request,
    env: AgentSandboxEnv,
    handlerContext: { containerId: string },
  ) => {
    const context = await getRunContext(env, handlerContext.containerId);
    if (
      !context.repository ||
      !matchesRepository(request.url, context.repository.https_url) ||
      !isGitReadRequest(request, context.repository.https_url)
    ) {
      return new Response('Git repository is not authorized for this run', { status: 403 });
    }
    return await fetchWithGitToken(request, env.GITHUB_READ_TOKEN);
  },
  'prairielearn.internal': async (
    request: Request,
    env: AgentSandboxEnv,
    handlerContext: { containerId: string },
  ) => {
    const context = await getRunContext(env, handlerContext.containerId);
    const match = /^\/tools\/([^/]+)$/.exec(new URL(request.url).pathname);
    if (request.method !== 'POST' || !match) return new Response('Not found', { status: 404 });
    const toolName = AgentToolNameSchema.parse(match[1]);
    if (!context.allowedTools.includes(toolName)) {
      return new Response('Tool is not authorized for this run', { status: 403 });
    }
    const toolRequest = AgentToolRequestSchema.parse(await request.clone().json());
    let enrichedRequest = toolRequest;
    if (toolName === 'render_question') {
      const qid = toolRequest.input.qid;
      if (typeof qid !== 'string') throw new Error('render_question requires a safe qid');
      const snapshot = await createRenderCheckpoint(env, context, qid);
      enrichedRequest = {
        ...toolRequest,
        input: { ...toolRequest.input, qid: snapshot.qid, files: snapshot.files },
        expected_revision: snapshot.headSha,
      };
    }
    enrichedRequest = {
      ...enrichedRequest,
      operation_id: await stableToolOperationId(context.runId, toolName, enrichedRequest),
    };
    if (isLocalFixture(context, env)) return localToolFixture(toolName, context, enrichedRequest);

    const target = new URL(
      `/pl/api/agent/v1/runs/${encodeURIComponent(context.runId)}/tools/${toolName}`,
      context.prairielearnBaseUrl,
    );
    return await fetch(
      withCapability(
        new Request(request, { method: 'POST', body: JSON.stringify(enrichedRequest) }),
        target,
        context.capability,
      ),
    );
  },
  'session-store.internal': async (
    request: Request,
    env: AgentSandboxEnv,
    handlerContext: { containerId: string },
  ) => {
    const context = await getRunContext(env, handlerContext.containerId);
    return await conversationRequest(env, context, request, '/internal/session-store');
  },
  'worker-events.internal': async (
    request: Request,
    env: AgentSandboxEnv,
    handlerContext: { containerId: string },
  ) => {
    const context = await getRunContext(env, handlerContext.containerId);
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/events') {
      return new Response('Not found', { status: 404 });
    }
    const body = AppendAgentEventsRequestSchema.parse(await request.clone().json());
    if (
      body.events.some(
        (event) => event.type !== 'assistant_message' && event.type !== 'assistant_message_delta',
      )
    ) {
      return new Response('Sandbox may only emit assistant telemetry', { status: 403 });
    }
    return await conversationRequest(
      env,
      context,
      new Request(request, { method: 'POST', body: JSON.stringify(body) }),
      '/internal/events',
    );
  },
};

async function stableToolOperationId(
  runId: string,
  toolName: AgentToolName,
  request: ReturnType<typeof AgentToolRequestSchema.parse>,
): Promise<string> {
  const input = new TextEncoder().encode(
    canonicalJson({
      expected_revision: request.expected_revision ?? null,
      input: request.input,
      run_id: runId,
      tool_name: toolName,
    }),
  );
  const digest = await crypto.subtle.digest('SHA-256', input);
  return `tool-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

AgentSandbox.outboundHandlers = {
  authenticatedGithubWrite: async (
    request: Request,
    env: AgentSandboxEnv,
    handlerContext: { containerId: string },
  ) => {
    const context = await getRunContext(env, handlerContext.containerId);
    if (
      !context.publicationTarget ||
      !matchesRepository(request.url, context.publicationTarget.https_url)
    ) {
      return new Response('Git publication target is not authorized', { status: 403 });
    }
    if (!env.GITHUB_WRITE_TOKEN) {
      return new Response('Git publication credentials are not configured', { status: 503 });
    }
    return await fetchWithGitToken(request, env.GITHUB_WRITE_TOKEN);
  },
};

async function getRunContext(
  env: AgentSandboxEnv,
  containerId: string,
): Promise<SandboxRunContext> {
  const sandbox = env.SANDBOX.get(env.SANDBOX.idFromString(containerId));
  const context = await sandbox.getRunContext();
  if (!context) throw new Error('Sandbox run context is not configured');
  return context;
}

async function conversationRequest(
  env: AgentSandboxEnv,
  context: SandboxRunContext,
  request: Request,
  pathname: string,
): Promise<Response> {
  const coordinator = env.CONVERSATIONS.getByName(context.conversationId);
  const headers = new Headers(request.headers);
  headers.set('x-prairielearn-run-id', context.runId);
  return await coordinator.fetch(
    new Request(
      `http://conversation${pathname}${pathname === '/internal/session-store' ? new URL(request.url).pathname : ''}`,
      {
        method: request.method,
        headers,
        body: request.body,
      },
    ),
  );
}

function withCapability(request: Request, target: URL, capability: string): Request {
  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${capability}`);
  return new Request(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  });
}

async function fetchWithGitToken(request: Request, token: string | undefined): Promise<Response> {
  if (!token) return new Response('Git credentials are not configured', { status: 503 });
  const headers = new Headers(request.headers);
  headers.set('authorization', `Basic ${btoa(`x-access-token:${token}`)}`);
  return await fetch(new Request(forceHttps(request), { headers, redirect: 'manual' }));
}

async function createRenderCheckpoint(
  env: AgentSandboxEnv,
  context: SandboxRunContext,
  qid: string,
): Promise<{ qid: string; files: { path: string; content: string }[]; headSha: string }> {
  const response = await conversationRequest(
    env,
    context,
    new Request('http://worker/render-checkpoint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ qid }),
    }),
    '/internal/render-checkpoint',
  );
  if (!response.ok) throw new Error(`Unable to checkpoint render input: ${await response.text()}`);
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null) {
    throw new Error('Render checkpoint returned an invalid Git revision');
  }
  const snapshot = body as Record<string, unknown>;
  if (
    typeof snapshot.head_sha !== 'string' ||
    typeof snapshot.qid !== 'string' ||
    !Array.isArray(snapshot.files) ||
    !snapshot.files.every(
      (file) =>
        typeof file === 'object' &&
        file !== null &&
        typeof (file as Record<string, unknown>).path === 'string' &&
        typeof (file as Record<string, unknown>).content === 'string',
    )
  ) {
    throw new Error('Render checkpoint returned an invalid question snapshot');
  }
  return {
    qid: snapshot.qid,
    files: snapshot.files as { path: string; content: string }[],
    headSha: snapshot.head_sha,
  };
}

function forceHttps(request: Request): URL {
  const url = new URL(request.url);
  url.protocol = 'https:';
  return url;
}

function matchesRepository(requestUrl: string, repositoryUrl: string): boolean {
  const request = forceHttps(new Request(requestUrl));
  const repository = new URL(repositoryUrl);
  const repositoryPath = repository.pathname.replace(/\/$/, '');
  return (
    request.hostname === repository.hostname &&
    (request.pathname === repositoryPath || request.pathname.startsWith(`${repositoryPath}/`))
  );
}

function isLocalFixture(context: SandboxRunContext, env: AgentSandboxEnv): boolean {
  return (
    env.LOCAL_DEVELOPMENT === 'true' &&
    new URL(context.prairielearnBaseUrl).hostname === 'prairielearn-fixture.invalid'
  );
}

function localToolFixture(
  toolName: AgentToolName,
  context: SandboxRunContext,
  request: ReturnType<typeof AgentToolRequestSchema.parse>,
): Response {
  return Response.json({
    operation_id: request.operation_id,
    event_id: crypto.randomUUID(),
    result: {
      fixture: true,
      tool_name: toolName,
      course_id: context.courseId,
      entities:
        toolName === 'list_entities'
          ? [{ qid: 'deterministic-question', type: 'question', title: 'Deterministic question' }]
          : undefined,
      content: toolName === 'read_course_file' ? '# Deterministic course fixture\n' : undefined,
      rendered: toolName === 'render_question' ? true : undefined,
      variant_seed: toolName === 'render_question' ? request.input.variant_seed : undefined,
      preview:
        toolName === 'render_question'
          ? { question_html: '<p>Rendered</p>', answer_html: '' }
          : undefined,
    },
  });
}
