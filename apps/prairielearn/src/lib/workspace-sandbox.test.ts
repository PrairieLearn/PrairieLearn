import { assert, describe, it, vi } from 'vitest';

import { withConfig } from '../tests/utils/config.js';

import {
  generateWorkspaceSandboxCookie,
  getWorkspaceSandboxHostname,
  validateWorkspaceSandboxAccess,
  validateWorkspaceSandboxWebSocketAccess,
} from './workspace-sandbox.js';

const workspaceId = '123';

const sandboxConfig = {
  secretKey: ['workspace-sandbox-test-secret'] as [string],
  serverCanonicalHost: 'https://us.prairielearn.test',
  workspaceAuthzCookieMaxAgeMilliseconds: 60 * 1000,
  workspaceHostMode: 'cross-origin' as const,
  workspaceSandboxBaseDomain: 'us.prairielearn-user-content.com',
};

describe('workspace sandbox', () => {
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
              'sec-fetch-site': 'same-origin',
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
              'sec-fetch-site': 'same-origin',
              cookie: `__Host-pl_workspace_authz=${currentCookie}`,
            },
          },
          '999999',
        ),
        { authorized: false, reason: 'workspace-mismatch' },
      );
    });
  });

  it('requires HTTP, navigation, and websocket requests to originate from the workspace', async () => {
    await withConfig(sandboxConfig, () => {
      const hostname = getWorkspaceSandboxHostname({ workspaceId });
      const currentCookie = generateWorkspaceSandboxCookie({ workspaceId });
      const headers = {
        cookie: `__Host-pl_workspace_authz=${currentCookie}`,
        host: hostname,
      };

      assert.isTrue(
        validateWorkspaceSandboxAccess(
          { method: 'POST', headers: { ...headers, origin: `https://${hostname}` } },
          workspaceId,
        ).authorized,
      );
      for (const requestHeaders of [
        { origin: 'https://w999999.us.prairielearn-user-content.com' },
        { 'sec-fetch-site': 'same-site' },
      ]) {
        assert.deepEqual(
          validateWorkspaceSandboxAccess(
            { method: 'POST', headers: { ...headers, ...requestHeaders } },
            workspaceId,
          ),
          { authorized: false, reason: 'invalid-origin' },
        );
      }
      const navigation = {
        ...headers,
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'iframe',
      };
      assert.isTrue(
        validateWorkspaceSandboxAccess(
          { method: 'GET', headers: { ...navigation, 'sec-fetch-site': 'same-origin' } },
          workspaceId,
        ).authorized,
      );
      assert.deepEqual(
        validateWorkspaceSandboxAccess({ method: 'GET', headers: navigation }, workspaceId),
        { authorized: false, reason: 'invalid-origin' },
      );

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
