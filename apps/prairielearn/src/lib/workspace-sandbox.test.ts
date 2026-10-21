import { assert, describe, it, vi } from 'vitest';

import { withConfig } from '../tests/utils/config.js';

import {
  classifyWorkspaceSandboxHost,
  generateWorkspaceSandboxCookie,
  generateWorkspaceSandboxSessionCookie,
  getWorkspaceSandboxHostname,
  getWorkspaceSandboxOrigin,
  getWorkspaceSandboxSession,
  validateWorkspaceSandboxAccess,
  validateWorkspaceSandboxWebSocketAccess,
} from './workspace-sandbox.js';

const workspaceId = '123';

const sandboxConfig = {
  secretKey: ['workspace-sandbox-test-secret'] as [string],
  sessionStoreExpireSeconds: 30 * 24 * 60 * 60,
  workspaceAuthzCookieMaxAgeMilliseconds: 60 * 1000,
  workspaceHostMode: 'cross-origin' as const,
  workspaceLaunchedTimeoutSec: 12 * 60 * 60,
  workspaceSandboxBaseDomain: 'us.prairielearn-user-content.com',
};

describe('workspace sandbox', () => {
  it('maps workspace IDs to sandbox hosts independently of the configured host mode', async () => {
    await withConfig(sandboxConfig, () => {
      const hostname = getWorkspaceSandboxHostname({ workspaceId });
      assert.equal(hostname, 'w123.us.prairielearn-user-content.com');
      assert.equal(getWorkspaceSandboxOrigin({ workspaceId }), `https://${hostname}`);
      assert.deepEqual(classifyWorkspaceSandboxHost(hostname), {
        type: 'workspace',
        workspaceId,
      });
    });

    await withConfig({ ...sandboxConfig, workspaceHostMode: 'same-origin' }, () => {
      assert.deepEqual(classifyWorkspaceSandboxHost('w123.us.prairielearn-user-content.com'), {
        type: 'workspace',
        workspaceId,
      });
    });
  });

  it('validates workspace cookies and binds them to the requested workspace', async () => {
    await withConfig(sandboxConfig, () => {
      const issuedAt = Date.UTC(2026, 9, 9);
      vi.useFakeTimers();
      const hostname = getWorkspaceSandboxHostname({ workspaceId });
      const validateCookie = (value: string) =>
        validateWorkspaceSandboxAccess(
          {
            headers: {
              host: hostname,
              cookie: `__Host-pl_workspace_authz=${value}`,
            },
          },
          workspaceId,
        );

      try {
        vi.setSystemTime(issuedAt);
        const cookie = generateWorkspaceSandboxCookie({ workspaceId });
        assert.isTrue(validateCookie(cookie).authorized);

        vi.setSystemTime(issuedAt + sandboxConfig.workspaceAuthzCookieMaxAgeMilliseconds + 1);
        assert.deepEqual(validateCookie(cookie), {
          authorized: false,
          reason: 'unauthorized',
        });
      } finally {
        vi.useRealTimers();
      }

      const currentCookie = generateWorkspaceSandboxCookie({ workspaceId });
      assert.deepEqual(
        validateWorkspaceSandboxAccess(
          {
            headers: {
              host: hostname,
              cookie: `__Host-pl_workspace_authz=${currentCookie}`,
            },
          },
          '999999',
        ),
        { authorized: false, reason: 'workspace-mismatch' },
      );
      const otherWorkspaceCookie = generateWorkspaceSandboxCookie({ workspaceId: '999999' });
      assert.deepEqual(
        validateWorkspaceSandboxAccess(
          {
            headers: {
              host: hostname,
              cookie: `__Host-pl_workspace_authz=${otherWorkspaceCookie}`,
            },
          },
          workspaceId,
        ),
        { authorized: false, reason: 'unauthorized' },
      );
    });
  });

  it('binds a sandbox session cookie to its workspace host', async () => {
    await withConfig(sandboxConfig, () => {
      const hostname = getWorkspaceSandboxHostname({ workspaceId });
      const authorizationCookies = { pl2_assessmentpw: 'signed-password' };
      const sessionCookie = generateWorkspaceSandboxSessionCookie({
        authorizationCookies,
        publicQuestionEndpoint: false,
        sessionId: 'session-123',
        workspaceId,
      });

      assert.deepEqual(
        getWorkspaceSandboxSession(
          {
            headers: {
              host: hostname,
              cookie: `__Host-pl_workspace_session=${sessionCookie}`,
            },
          },
          workspaceId,
        ),
        {
          authorization_cookies: authorizationCookies,
          public_question_endpoint: false,
          purpose: 'workspace-sandbox-session',
          session_id: 'session-123',
          version: 1,
          workspace_id: workspaceId,
        },
      );
      assert.isNull(
        getWorkspaceSandboxSession(
          {
            headers: {
              host: getWorkspaceSandboxHostname({ workspaceId: '999999' }),
              cookie: `__Host-pl_workspace_session=${sessionCookie}`,
            },
          },
          '999999',
        ),
      );
    });
  });

  it('requires websocket requests to originate from their workspace host', async () => {
    await withConfig(sandboxConfig, () => {
      const hostname = getWorkspaceSandboxHostname({ workspaceId });
      const currentCookie = generateWorkspaceSandboxCookie({ workspaceId });
      const headers = {
        cookie: `__Host-pl_workspace_authz=${currentCookie}`,
        host: hostname,
      };

      assert.isTrue(
        validateWorkspaceSandboxWebSocketAccess(
          { headers: { ...headers, origin: `https://${hostname}` } },
          workspaceId,
        ).authorized,
      );
      assert.deepEqual(
        validateWorkspaceSandboxWebSocketAccess(
          { headers: { ...headers, origin: 'https://w999999.us.prairielearn-user-content.com' } },
          workspaceId,
        ),
        { authorized: false, reason: 'invalid-origin' },
      );
    });
  });
});
