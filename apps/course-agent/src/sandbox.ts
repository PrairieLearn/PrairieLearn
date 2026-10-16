import { Sandbox as CloudflareSandbox } from '@cloudflare/sandbox';

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

Sandbox.outboundByHost = {
  'openai.internal': (request: Request, env: { CODEX_API_KEY: string; CODEX_MODEL?: string }) =>
    forwardOpenAI(request, env),
};
Sandbox.outboundHandlers = {
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
