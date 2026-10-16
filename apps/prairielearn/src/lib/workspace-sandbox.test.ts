import * as jose from 'jose';
import { assert, describe, it } from 'vitest';

import { withConfig } from '../tests/utils/config.js';

import {
  classifyWorkspaceSandboxHost,
  generateWorkspaceSandboxBootstrapJwt,
  generateWorkspaceSandboxCookie,
  getAuthorizedWorkspaceSandboxHost,
  getWorkspaceSandboxHostname,
  getWorkspaceSandboxOrigin,
  verifyWorkspaceSandboxBootstrapJwt,
  verifyWorkspaceSandboxCookie,
} from './workspace-sandbox.js';

const workspaceId = '123';

const sandboxConfig = {
  secretKey: ['workspace-sandbox-test-secret'] as [string],
  workspaceIsolationMode: 'cross-origin' as const,
  workspaceLaunchedTimeoutSec: 12 * 60 * 60,
  workspaceSandboxBaseDomain: 'us.prairielearn-user-content.com',
};

describe('workspace sandbox', () => {
  it('constructs and parses a workspace-specific hostname', async () => {
    await withConfig(sandboxConfig, () => {
      const hostname = getWorkspaceSandboxHostname({ workspaceId });
      assert.equal(hostname, 'w123.us.prairielearn-user-content.com');
      assert.equal(getWorkspaceSandboxOrigin({ workspaceId }), `https://${hostname}`);
      assert.deepEqual(classifyWorkspaceSandboxHost(hostname), {
        type: 'workspace',
        workspaceId,
      });
    });
  });

  it('rejects malformed hosts beneath the sandbox domain', async () => {
    await withConfig(sandboxConfig, () => {
      assert.deepEqual(
        classifyWorkspaceSandboxHost('unexpected.us.prairielearn-user-content.com'),
        { type: 'invalid-sandbox-host' },
      );
      assert.deepEqual(
        classifyWorkspaceSandboxHost(`w${workspaceId}-launch.us.prairielearn-user-content.com`),
        { type: 'invalid-sandbox-host' },
      );
      assert.deepEqual(classifyWorkspaceSandboxHost('us.prairielearn.com'), {
        type: 'not-sandbox',
      });
    });
  });

  it('recognizes a configured sandbox host while same-origin fallback is active', async () => {
    await withConfig({ ...sandboxConfig, workspaceIsolationMode: 'same-origin' }, () => {
      const hostname = getWorkspaceSandboxHostname({ workspaceId });
      assert.equal(classifyWorkspaceSandboxHost(hostname).type, 'workspace');
    });
  });

  it('signs workspace cookies and enforces their lifetime', async () => {
    await withConfig(sandboxConfig, () => {
      const issuedAt = Date.UTC(2026, 9, 9);
      const cookie = generateWorkspaceSandboxCookie({ workspaceId }, issuedAt);

      assert.deepEqual(verifyWorkspaceSandboxCookie(cookie, issuedAt + 1000), {
        version: 1,
        workspace_id: workspaceId,
        issued_at_ms: issuedAt,
      });
      assert.isNull(verifyWorkspaceSandboxCookie(`${cookie}tampered`, issuedAt + 1000));
      assert.isNull(
        verifyWorkspaceSandboxCookie(cookie, issuedAt + (12 * 60 * 60 + 5 * 60) * 1000 + 1),
      );

      const hostname = getWorkspaceSandboxHostname({ workspaceId });
      const currentCookie = generateWorkspaceSandboxCookie({ workspaceId });
      assert.deepEqual(
        getAuthorizedWorkspaceSandboxHost({
          headers: {
            host: `${hostname}:443`,
            cookie: `unrelated=value; __Host-pl_workspace_authz=${currentCookie}`,
          },
        }),
        { type: 'workspace', workspaceId },
      );
      assert.isNull(getAuthorizedWorkspaceSandboxHost({ headers: { host: hostname } }));
    });
  });

  it('signs and verifies workspace bootstrap JWTs', async () => {
    await withConfig(sandboxConfig, async () => {
      const jwt = await generateWorkspaceSandboxBootstrapJwt({ workspaceId });
      assert.deepEqual(await verifyWorkspaceSandboxBootstrapJwt(jwt), {
        purpose: 'workspace-bootstrap',
        workspace_id: workspaceId,
      });
      const payloadData = jose.decodeJwt(jwt);
      assert.equal(payloadData.aud, 'workspace-sandbox');
      assert.equal(payloadData.iss, 'PrairieLearn');
      assert.equal(payloadData.exp, (payloadData.iat ?? 0) + 60);

      const [header, payload, signature] = jwt.split('.');
      assert.isDefined(header);
      assert.isDefined(payload);
      assert.isDefined(signature);
      const tamperedSignature = `${signature.startsWith('a') ? 'b' : 'a'}${signature.slice(1)}`;
      assert.isNull(
        await verifyWorkspaceSandboxBootstrapJwt(`${header}.${payload}.${tamperedSignature}`),
      );
    });
  });
});
