import cookieParser from 'cookie-parser';
import express from 'express';
import * as jose from 'jose';
import { assert, describe, it } from 'vitest';

import { withServer } from '@prairielearn/express-test-utils';

import { features } from '../../lib/features/index.js';
import { verifyWorkspaceSandboxBootstrapJwt } from '../../lib/workspace-sandbox.js';
import { withConfig } from '../../tests/utils/config.js';

import { createWorkspaceTrpcClient } from './client.js';
import { workspaceTrpcRouter } from './trpc.js';

const sandboxConfig = {
  secretKey: ['workspace-sandbox-test-secret'] as [string],
  serverCanonicalHost: 'https://us.prairielearn.test',
  workspaceHostMode: 'cross-origin' as const,
  workspaceSandboxBaseDomain: 'workspace-hosts.test',
};

async function withWorkspaceServer(fn: (urlBase: string) => Promise<void>) {
  const app = express();
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.session = {
      destroy: async () => {},
      getExpirationDate: () => new Date(Date.now() + 60_000),
      id: 'session-123',
      regenerate: async () => {},
      setExpiration: () => {},
    };
    next();
  });
  app.use('/pl/workspace/:workspace_id/trpc', (req, res, next) => {
    res.locals.workspace_id = req.params.workspace_id;
    res.locals.workspace_access_authorized = true;
    res.locals.workspace_state = 'running';
    next();
  });
  app.use('/pl/workspace/:workspace_id/trpc', workspaceTrpcRouter);

  await withServer(app, async ({ url }) => fn(url));
}

describe('workspace authorization tRPC router', () => {
  it('issues short-lived bootstrap credentials for an authorized running workspace', async () => {
    await features.runWithGlobalOverrides({ 'workspace-specific-hosts': true }, async () => {
      await withConfig(sandboxConfig, async () => {
        await withWorkspaceServer(async (urlBase) => {
          const client = createWorkspaceTrpcClient({
            csrfToken: 'unused-in-this-test',
            workspaceId: '123',
            publicQuestionEndpoint: false,
            urlBase,
          });
          const result = await client.authorization.issue.mutate();

          assert.equal(result.sandboxOrigin, 'https://w123.workspace-hosts.test');
          assert.equal(result.bootstrapUrl, `${result.sandboxOrigin}/bootstrap`);
          assert.deepEqual(await verifyWorkspaceSandboxBootstrapJwt(result.jwt), {
            authorization_cookies: {},
            public_question_endpoint: false,
            purpose: 'workspace-bootstrap',
            session_id: 'session-123',
            workspace_id: '123',
          });
          const payload = jose.decodeJwt(result.jwt);
          assert.equal(payload.exp, (payload.iat ?? 0) + 60);
        });
      });
    });
  });
});
