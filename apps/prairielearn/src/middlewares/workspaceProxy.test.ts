import express from 'express';
import { assert, describe, it } from 'vitest';

import { withServer } from '@prairielearn/express-test-utils';

import { makeWorkspaceProxyMiddleware, rewriteWorkspaceContainerCookie } from './workspaceProxy.js';

const CONTAINER_PATH_REGEX = /^\/pl\/workspace\/([0-9]+)\/container\/(.*)/;

async function expectWebSocketRejection(url: string) {
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('WebSocket connection did not settle'));
    }, 1000);

    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        socket.close();
        reject(new Error('WebSocket connection was unexpectedly accepted'));
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

describe('workspace proxy', () => {
  it('makes container cookies usable in a partitioned cross-origin iframe', () => {
    assert.equal(
      rewriteWorkspaceContainerCookie(
        'session=abc; Domain=container; Path=/app; HttpOnly; SameSite=Lax',
      ),
      'session=abc; Path=/app; HttpOnly; Secure; SameSite=None; Partitioned',
    );
    assert.isNull(rewriteWorkspaceContainerCookie('__Host-pl_workspace_authz=overwrite; Path=/'));
    assert.isNull(rewriteWorkspaceContainerCookie('__Host-pl_workspace_session=overwrite; Path=/'));
  });

  it('scopes websocket upgrades to the matching host before authorizing them', async () => {
    let mismatchedHostWasAuthorized = false;
    let authorizedWorkspaceId: string | undefined;
    const app = express();
    app.use(
      makeWorkspaceProxyMiddleware(CONTAINER_PATH_REGEX, {
        matchesRequestHost: () => false,
        authorizeWebSocketRequest: () => {
          mismatchedHostWasAuthorized = true;
          return false;
        },
      }),
    );
    app.use(
      makeWorkspaceProxyMiddleware(CONTAINER_PATH_REGEX, {
        matchesRequestHost: () => true,
        authorizeWebSocketRequest: (_req, workspaceId) => {
          authorizedWorkspaceId = workspaceId;
          return false;
        },
      }),
    );
    app.get('/prime', (_req, res) => res.send('ok'));

    await withServer(app, async ({ url }) => {
      // The proxy subscribes to raw server upgrades when it handles its first request.
      await fetch(`${url}/prime`);

      await expectWebSocketRejection(`${url.replace(/^http/, 'ws')}/pl/workspace/123/container/`);
    });

    assert.isFalse(mismatchedHostWasAuthorized);
    assert.equal(authorizedWorkspaceId, '123');
  });
});
