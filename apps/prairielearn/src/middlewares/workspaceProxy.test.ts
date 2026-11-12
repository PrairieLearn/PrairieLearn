import http from 'node:http';

import express from 'express';
import { assert, describe, it, vi } from 'vitest';

import { withServer } from '@prairielearn/express-test-utils';
import * as sqldb from '@prairielearn/postgres';

import { generateWorkspaceSandboxCookie } from '../lib/workspace-sandbox.js';
import { withConfig } from '../tests/utils/config.js';

import { rewriteWorkspaceContainerCookie } from './workspaceProxy.js';
import { makeWorkspaceSandboxMiddleware } from './workspaceSandbox.js';

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

  it('preserves container caching and CSP while restricting framing and service worker scope', async () => {
    await withConfig(
      {
        serverCanonicalHost: 'https://us.prairielearn.test',
        workspaceSandboxBaseDomain: 'us.prairielearn-user-content.test',
      },
      async () => {
        const container = express();
        container.get('/style.css', (_req, res) => {
          res.set({
            'Cache-Control': 'private, max-age=3600',
            'Content-Security-Policy': [
              "default-src 'self'; frame-ancestors 'self';",
              "img-src 'self'; FRAME-ANCESTORS 'none';",
            ],
            'Service-Worker-Allowed': '/',
            Vary: 'Accept-Encoding',
          });
          res.type('css').send('body { color: red; }');
        });
        await withServer(container, async ({ url: containerUrl }) => {
          const hostnameQuery = vi
            .spyOn(sqldb, 'queryOptionalScalar')
            .mockResolvedValue(new URL(containerUrl).host);
          const rewriteQuery = vi.spyOn(sqldb, 'queryScalar').mockResolvedValue(true);
          try {
            const app = express();
            app.use(makeWorkspaceSandboxMiddleware());
            await withServer(app, async ({ url }) => {
              const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
                http
                  .get(
                    `${url}/pl/workspace/123/container/style.css`,
                    {
                      headers: {
                        Host: 'w123.us.prairielearn-user-content.test',
                        Origin: 'https://w123.us.prairielearn-user-content.test',
                        Cookie: `__Host-pl_workspace_authz=${generateWorkspaceSandboxCookie({ workspaceId: '123' })}`,
                      },
                    },
                    resolve,
                  )
                  .on('error', reject);
              });
              let body = '';
              for await (const chunk of response) body += chunk;
              assert.equal(response.statusCode, 200);
              assert.equal(body, 'body { color: red; }');
              assert.equal(response.headers['cache-control'], 'private, max-age=3600');
              assert.equal(
                response.headers['content-security-policy'],
                "default-src 'self';, img-src 'self';, frame-ancestors https://us.prairielearn.test;",
              );
              assert.isUndefined(response.headers['service-worker-allowed']);
              assert.include(response.headers.vary, 'Accept-Encoding');
              assert.include(response.headers.vary, 'Sec-Fetch-Site');
            });
          } finally {
            hostnameQuery.mockRestore();
            rewriteQuery.mockRestore();
          }
        });
      },
    );
  });
});
