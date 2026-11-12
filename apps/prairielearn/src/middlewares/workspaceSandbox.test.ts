import http from 'node:http';
import { text } from 'node:stream/consumers';

import express from 'express';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { withServer } from '@prairielearn/express-test-utils';
import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { withResolvers } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import { PostgresSessionStore } from '../lib/session-store.js';
import {
  generateWorkspaceSandboxBootstrapToken,
  getWorkspaceSandboxHostname,
  getWorkspaceSandboxSession,
  validateWorkspaceSandboxAccess,
} from '../lib/workspace-sandbox.js';
import * as helperDb from '../tests/helperDb.js';
import { withConfig } from '../tests/utils/config.js';

import { makeWorkspaceSandboxMiddleware } from './workspaceSandbox.js';

const sql = loadSqlEquiv(import.meta.url);
let workspaceId: string;
const sandboxConfig = {
  devMode: false,
  secretKey: ['workspace-sandbox-test-secret'] as [string],
  serverCanonicalHost: 'https://us.prairielearn.test',
  workspaceHostMode: 'cross-origin' as const,
  workspaceSandboxBaseDomain: 'us.prairielearn-user-content.test',
};

async function request({
  baseUrl,
  path,
  host,
  method = 'GET',
  body,
  headers,
}: {
  baseUrl: string;
  path: string;
  host: string;
  method?: string;
  body?: URLSearchParams;
  headers?: http.OutgoingHttpHeaders;
}) {
  const bodyString = body?.toString();
  const received = withResolvers<http.IncomingMessage>();
  const req = http.request(
    new URL(path, baseUrl),
    {
      method,
      headers: {
        ...headers,
        Host: host,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyString ?? ''),
      },
    },
    received.resolve,
  );
  req.on('error', received.reject);
  req.end(bodyString);
  const response = await received.promise;
  assert.isDefined(response.statusCode);
  return { status: response.statusCode, headers: response.headers, body: await text(response) };
}

describe('workspace sandbox middleware', () => {
  beforeAll(async () => {
    await helperDb.before();
    workspaceId = await queryScalar(sql.insert_workspace, IdSchema);
  });
  afterAll(helperDb.after);

  it('redeems a bootstrap token once, on its workspace host, to establish authorization', async () => {
    await withConfig(sandboxConfig, async () => {
      const token = await generateWorkspaceSandboxBootstrapToken({
        authorizationCookies: { pl2_assessmentpw: 'signed-password' },
        publicQuestionEndpoint: false,
        sessionId: 'session-123',
        workspaceId,
      });
      const hostname = getWorkspaceSandboxHostname({ workspaceId });

      const app = express().use(makeWorkspaceSandboxMiddleware());
      await withServer(app, async ({ url: baseUrl }) => {
        const unauthorizedResponse = await request({
          baseUrl,
          path: `/pl/workspace/${workspaceId}/container/`,
          host: hostname,
          headers: { 'Sec-Fetch-Site': 'same-origin' },
        });
        assert.equal(unauthorizedResponse.status, 401);

        const bootstrapRequest = {
          baseUrl,
          path: '/bootstrap',
          host: hostname,
          method: 'POST',
          headers: { Origin: sandboxConfig.serverCanonicalHost },
          body: new URLSearchParams({ token }),
        };
        const wrongOrigin = await request({
          ...bootstrapRequest,
          headers: { Origin: 'https://w999999.us.prairielearn-user-content.test' },
        });
        assert.equal(wrongOrigin.status, 403);
        const wrongWorkspace = await request({
          ...bootstrapRequest,
          host: getWorkspaceSandboxHostname({ workspaceId: '999999' }),
        });
        assert.equal(wrongWorkspace.status, 401);

        const responses = await Promise.all([request(bootstrapRequest), request(bootstrapRequest)]);
        responses.sort((a, b) => a.status - b.status);
        const [response, replay] = responses;
        assert.equal(response.status, 200);
        assert.equal(replay.status, 401);
        assert.isUndefined(replay.headers['set-cookie']);
        const cookies = response.headers['set-cookie'];
        assert.isDefined(cookies);
        const workspaceRequest = {
          headers: {
            host: hostname,
            'sec-fetch-site': 'same-origin',
            cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
          },
        };
        assert.isTrue(validateWorkspaceSandboxAccess(workspaceRequest, workspaceId).authorized);
        const session = getWorkspaceSandboxSession(workspaceRequest, workspaceId);
        assert.isNotNull(session);
        assert.equal(session.session_id, 'session-123');
        assert.deepEqual(session.authorization_cookies, { pl2_assessmentpw: 'signed-password' });
        const otherWorkspaceRequest = {
          headers: {
            ...workspaceRequest.headers,
            host: getWorkspaceSandboxHostname({ workspaceId: '999999' }),
          },
        };
        assert.deepEqual(validateWorkspaceSandboxAccess(otherWorkspaceRequest, '999999'), {
          authorized: false,
          reason: 'unauthorized',
        });
        assert.isNull(getWorkspaceSandboxSession(otherWorkspaceRequest, '999999'));

        const sessionStore = new PostgresSessionStore();
        await sessionStore.set('session-123', {}, new Date(Date.now() + 60_000));
        const sessionCookie = cookies.find((cookie) =>
          cookie.startsWith('__Host-pl_workspace_session='),
        );
        assert.isDefined(sessionCookie);
        const reauthorization = await request({
          baseUrl,
          path: `/pl/workspace/${workspaceId}/container/`,
          host: hostname,
          headers: {
            'Sec-Fetch-Site': 'same-origin',
            Cookie: sessionCookie.split(';')[0],
          },
        });
        assert.equal(reauthorization.status, 401);
        assert.include(reauthorization.body, 'prairielearn:workspace-authorization-expired');
        assert.isUndefined(reauthorization.headers.location);

        const expiredToken = await generateWorkspaceSandboxBootstrapToken({
          authorizationCookies: {},
          publicQuestionEndpoint: false,
          sessionId: 'session-123',
          workspaceId,
        });
        await execute(sql.expire_bootstrap_tokens);
        const expiredResponse = await request({
          ...bootstrapRequest,
          body: new URLSearchParams({ token: expiredToken }),
        });
        assert.equal(expiredResponse.status, 401);
        assert.isUndefined(expiredResponse.headers['set-cookie']);

        const oversizedResponse = await request({
          ...bootstrapRequest,
          body: new URLSearchParams({ token: 'a'.repeat(9 * 1024) }),
        });
        assert.equal(oversizedResponse.status, 413);
        assert.notInclude(oversizedResponse.body, 'workspace-authorization-expired');
      });
    });
  });
});
