import http from 'node:http';

import express from 'express';
import { assert, describe, it } from 'vitest';

import { withServer } from '@prairielearn/express-test-utils';

import {
  generateWorkspaceSandboxBootstrapJwt,
  getWorkspaceSandboxHostname,
} from '../lib/workspace-sandbox.js';
import { withConfig } from '../tests/utils/config.js';

import { makeWorkspaceSandboxMiddleware } from './workspaceSandbox.js';

const workspaceId = '123';
const sandboxConfig = {
  secretKey: ['workspace-sandbox-test-secret'] as [string],
  serverCanonicalHost: 'https://us.prairielearn.test',
  workspaceHostMode: 'cross-origin' as const,
  workspaceSandboxBaseDomain: 'workspace-hosts.test',
};

function createApp() {
  const app = express();
  app.use(makeWorkspaceSandboxMiddleware());
  app.get('/main', (_req, res) => res.send('main'));
  return app;
}

async function request({
  baseUrl,
  path,
  host,
  method = 'GET',
  body,
}: {
  baseUrl: string;
  path: string;
  host?: string;
  method?: string;
  body?: URLSearchParams;
}) {
  const url = new URL(baseUrl);
  const bodyString = body?.toString();
  return await new Promise<{
    body: string;
    headers: http.IncomingHttpHeaders;
    status: number;
  }>((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path,
        method,
        headers: {
          ...(host == null ? {} : { Host: host }),
          ...(bodyString == null
            ? {}
            : {
                'Content-Length': Buffer.byteLength(bodyString),
                'Content-Type': 'application/x-www-form-urlencoded',
              }),
        },
      },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (responseBody += chunk));
        res.on('end', () => {
          resolve({ body: responseBody, headers: res.headers, status: res.statusCode ?? 0 });
        });
      },
    );
    req.on('error', reject);
    req.end(bodyString);
  });
}

describe('workspace sandbox middleware', () => {
  it('accepts a bootstrap JWT and establishes sandbox authorization', async () => {
    await withConfig(sandboxConfig, async () => {
      const jwt = await generateWorkspaceSandboxBootstrapJwt({
        authorizationCookies: {},
        publicQuestionEndpoint: false,
        sessionId: 'session-123',
        workspaceId,
      });
      const hostname = getWorkspaceSandboxHostname({ workspaceId });

      await withServer(createApp(), async ({ url: baseUrl }) => {
        const response = await request({
          baseUrl,
          path: '/bootstrap',
          host: hostname,
          method: 'POST',
          body: new URLSearchParams({ jwt }),
        });
        assert.equal(response.status, 303);
        assert.equal(response.headers.location, `/pl/workspace/${workspaceId}/container/`);

        const setCookie = response.headers['set-cookie']?.join('; ');
        assert.isDefined(setCookie);
        assert.include(setCookie, '__Host-pl_workspace_authz=');
        assert.include(setCookie, '__Host-pl_workspace_session=');
        assert.include(setCookie, 'HttpOnly');
        assert.include(setCookie, 'Secure');
        assert.include(setCookie, 'Partitioned');
        assert.include(setCookie, 'SameSite=None');
        assert.notInclude(setCookie, 'Domain=');

        const otherWorkspaceJwt = await generateWorkspaceSandboxBootstrapJwt({
          authorizationCookies: {},
          publicQuestionEndpoint: false,
          sessionId: 'session-123',
          workspaceId: '999999',
        });
        const mismatchedWorkspaceResponse = await request({
          baseUrl,
          path: '/bootstrap',
          host: hostname,
          method: 'POST',
          body: new URLSearchParams({ jwt: otherWorkspaceJwt }),
        });
        assert.equal(mismatchedWorkspaceResponse.status, 403);
      });
    });
  });

  it('protects sandbox hosts without intercepting unrelated hosts', async () => {
    await withConfig(sandboxConfig, async () => {
      const hostname = getWorkspaceSandboxHostname({ workspaceId });

      await withServer(createApp(), async ({ url: baseUrl }) => {
        const unauthorizedResponse = await request({
          baseUrl,
          path: `/pl/workspace/${workspaceId}/container/`,
          host: hostname,
        });
        assert.equal(unauthorizedResponse.status, 401);
        assert.include(unauthorizedResponse.body, 'prairielearn:workspace-authorization-expired');

        const invalidHostResponse = await request({
          baseUrl,
          path: '/main',
          host: `unknown.${sandboxConfig.workspaceSandboxBaseDomain}`,
        });
        assert.equal(invalidHostResponse.status, 404);

        const mainResponse = await request({ baseUrl, path: '/main' });
        assert.equal(mainResponse.status, 200);
        assert.equal(mainResponse.body, 'main');
      });
    });
  });
});
