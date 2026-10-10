import { Sandbox as CloudflareSandbox } from '@cloudflare/sandbox';
import { getAgentByName } from 'agents';
import { z } from 'zod';

import type { Env } from './agent.js';
import { forwardGitHub, forwardOpenAI } from './outbound.js';

export class Sandbox extends CloudflareSandbox {
  enableInternet = false;
  // Presigned R2 uploads use HTTPS; the SDK configures trust for its interception CA.
  interceptHttps = true;
  allowedHosts: string[];

  constructor(
    ctx: DurableObjectState<Record<string, never>>,
    env: {
      CLOUDFLARE_ACCOUNT_ID: string;
      BACKUP_BUCKET_ENDPOINT?: string;
      LOCAL_DEV?: string;
    },
  ) {
    super(ctx, env);
    this.allowedHosts = ['openai.internal', 'github.com'];
    if (env.LOCAL_DEV === 'true') return;
    // The SDK uploads/downloads backups from the container with presigned R2 URLs.
    const backupOrigin =
      env.BACKUP_BUCKET_ENDPOINT ?? `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    this.allowedHosts.push(new URL(backupOrigin).hostname);
  }
}

Sandbox.outboundHandlers = {
  openai: async (
    request: Request,
    env: Env & { CODEX_API_KEY: string },
    context: { params?: unknown },
  ) => {
    const parsed = z
      .object({
        conversationId: z.uuid(),
        sandboxId: z.uuid(),
        actionId: z.uuid(),
        capacityGrantId: z.uuid(),
      })
      .safeParse(context.params);
    if (!parsed.success) return new Response('Execution binding required', { status: 403 });
    const { conversationId, ...binding } = parsed.data;
    const chat = await getAgentByName(env.Chat, conversationId);
    return forwardOpenAI(request, env, fetch, {
      stop: (message) => chat.stopForBudget(binding, message),
      check: () => chat.authorizeModelCount(binding),
      reserve: (details) => chat.reserveModelRequest(binding, details),
      dispatch: (id) => chat.dispatchModelRequest(binding, id),
      settle: (input) => chat.settleModelRequest(input),
    });
  },
  github: (
    request: Request,
    env: { GITHUB_CLIENT_TOKEN?: string },
    context: { params?: unknown },
  ) => {
    if (
      !context.params ||
      typeof context.params !== 'object' ||
      !('repository' in context.params) ||
      typeof context.params.repository !== 'string'
    ) {
      return new Response('Forbidden', { status: 403 });
    }
    return forwardGitHub(request, {
      repository: context.params.repository,
      GITHUB_CLIENT_TOKEN: env.GITHUB_CLIENT_TOKEN,
    });
  },
};
