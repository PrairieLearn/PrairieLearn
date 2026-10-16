import http from 'node:http';

import express from 'express';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { WorkspaceSchema } from '../lib/db-types.js';
import {
  generateWorkspaceSandboxBootstrapJwt,
  getWorkspaceSandboxHostname,
} from '../lib/workspace-sandbox.js';
import * as helperDb from '../tests/helperDb.js';
import { withConfig } from '../tests/utils/config.js';

import { makeWorkspaceSandboxMiddleware } from './workspaceSandbox.js';

const sql = loadSqlEquiv(import.meta.url);
const sandboxConfig = {
  secretKey: ['workspace-sandbox-test-secret'] as [string],
  serverCanonicalHost: 'https://us.prairielearn.test',
  workspaceIsolationMode: 'cross-origin' as const,
  workspaceSandboxBaseDomain: 'us.prairielearn-user-content.test',
};

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(makeWorkspaceSandboxMiddleware());
  app.get('/main', (_req, res) => res.send('main'));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address == null || typeof address === 'string') throw new Error('Server did not start');

  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error == null ? resolve() : reject(error)));
    });
  }
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
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  it('accepts a bootstrap JWT and sets a partitioned host cookie', async () => {
    await withConfig(sandboxConfig, async () => {
      const launch_uuid = '550e8400-e29b-41d4-a716-446655440000';
      const workspace = await queryRow(
        sql.insert_running_workspace,
        { launch_uuid },
        WorkspaceSchema,
      );
      const jwt = await generateWorkspaceSandboxBootstrapJwt({ workspaceId: workspace.id });
      const hostname = getWorkspaceSandboxHostname({ workspaceId: workspace.id });

      await withServer(async (baseUrl) => {
        const response = await request({
          baseUrl,
          path: '/bootstrap',
          host: hostname,
          method: 'POST',
          body: new URLSearchParams({ jwt }),
        });
        assert.equal(response.status, 303);
        assert.equal(response.headers.location, `/pl/workspace/${workspace.id}/container/`);

        const setCookie = response.headers['set-cookie']?.join('; ');
        assert.isDefined(setCookie);
        assert.include(setCookie, '__Host-pl_workspace_authz=');
        assert.include(setCookie, 'HttpOnly');
        assert.include(setCookie, 'Secure');
        assert.include(setCookie, 'Partitioned');
        assert.include(setCookie, 'SameSite=None');
        assert.notInclude(setCookie, 'Domain=');

        const replayResponse = await request({
          baseUrl,
          path: '/bootstrap',
          host: hostname,
          method: 'POST',
          body: new URLSearchParams({ jwt }),
        });
        assert.equal(replayResponse.status, 303);

        const otherWorkspaceJwt = await generateWorkspaceSandboxBootstrapJwt({
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

  it('denies requests without a sandbox cookie and denies unknown sandbox hosts', async () => {
    await withConfig(sandboxConfig, async () => {
      const launch_uuid = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
      const workspace = await queryRow(
        sql.insert_running_workspace,
        { launch_uuid },
        WorkspaceSchema,
      );
      const hostname = getWorkspaceSandboxHostname({ workspaceId: workspace.id });

      await withServer(async (baseUrl) => {
        const unauthorizedResponse = await request({
          baseUrl,
          path: `/pl/workspace/${workspace.id}/container/`,
          host: hostname,
        });
        assert.equal(unauthorizedResponse.status, 401);
        assert.include(unauthorizedResponse.body, 'prairielearn:workspace-authorization-expired');
        assert.equal(unauthorizedResponse.headers['referrer-policy'], 'no-referrer');

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
