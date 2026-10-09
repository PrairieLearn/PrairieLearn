import http from 'node:http';

import express from 'express';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { getAppError } from '../../lib/client/errors.js';
import { WorkspaceSchema } from '../../lib/db-types.js';
import { verifyWorkspaceSandboxBootstrapJwt } from '../../lib/workspace-sandbox.js';
import * as helperDb from '../../tests/helperDb.js';
import { withConfig } from '../../tests/utils/config.js';

import type { WorkspaceAuthorizationError } from './authorization.js';
import { createWorkspaceTrpcClient } from './client.js';
import { workspaceTrpcRouter } from './trpc.js';

const sql = loadSqlEquiv(import.meta.url);
const sandboxConfig = {
  secretKey: ['workspace-sandbox-test-secret'] as [string],
  serverCanonicalHost: 'https://us.prairielearn.test',
  workspaceIsolationMode: 'cross-origin' as const,
  workspaceSandboxBaseDomain: 'us.prairielearn-user-content.test',
};

async function withServer<T>({
  authorized,
  fn,
}: {
  authorized: boolean;
  fn: (urlBase: string) => Promise<T>;
}): Promise<T> {
  const app = express();
  app.use('/pl/workspace/:workspace_id/trpc', (req, res, next) => {
    res.locals.workspace_id = req.params.workspace_id;
    res.locals.workspace_access_authorized = authorized;
    next();
  });
  app.use('/pl/workspace/:workspace_id/trpc', workspaceTrpcRouter);

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

describe('workspace authorization tRPC router', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  it('issues a workspace bootstrap JWT through an authorized workspace scope', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      await withConfig(sandboxConfig, async () => {
        const launch_uuid = '550e8400-e29b-41d4-a716-446655440000';
        const workspace = await queryRow(
          sql.insert_workspace,
          { launch_uuid, state: 'running' },
          WorkspaceSchema,
        );

        await withServer({
          authorized: true,
          fn: async (urlBase) => {
            const client = createWorkspaceTrpcClient({
              csrfToken: 'unused-in-this-test',
              workspaceId: workspace.id,
              publicQuestionEndpoint: false,
              urlBase,
            });
            const result = await client.authorization.issue.mutate();

            assert.equal(
              result.sandboxOrigin,
              `https://w${workspace.id}.us.prairielearn-user-content.test`,
            );
            assert.equal(result.bootstrapUrl, `${result.sandboxOrigin}/bootstrap`);
            assert.isAbove(result.authorizationMaxAgeMilliseconds, 0);
            assert.deepEqual(await verifyWorkspaceSandboxBootstrapJwt(result.jwt), {
              purpose: 'workspace-bootstrap',
              workspace_id: workspace.id,
            });
          },
        });
      });
    });
  });

  it('does not issue a bootstrap JWT for a stopped workspace', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      await withConfig(sandboxConfig, async () => {
        const workspace = await queryRow(
          sql.insert_workspace,
          {
            launch_uuid: '550e8400-e29b-41d4-a716-446655440000',
            state: 'stopped',
          },
          WorkspaceSchema,
        );

        await withServer({
          authorized: true,
          fn: async (urlBase) => {
            const client = createWorkspaceTrpcClient({
              csrfToken: 'unused-in-this-test',
              workspaceId: workspace.id,
              publicQuestionEndpoint: false,
              urlBase,
            });
            try {
              await client.authorization.issue.mutate();
              assert.fail('Expected JWT issuance to be rejected');
            } catch (error) {
              assert.deepEqual(getAppError<WorkspaceAuthorizationError['Issue']>(error), {
                code: 'UNKNOWN',
                message: 'Workspace is not running',
              });
            }
          },
        });
      });
    });
  });

  it('rejects a router mounted without workspace authorization', async () => {
    await withServer({
      authorized: false,
      fn: async (urlBase) => {
        const client = createWorkspaceTrpcClient({
          csrfToken: 'unused-in-this-test',
          workspaceId: '1',
          publicQuestionEndpoint: false,
          urlBase,
        });
        try {
          await client.authorization.issue.mutate();
          assert.fail('Expected workspace authorization to be rejected');
        } catch (error) {
          assert.deepEqual(getAppError<WorkspaceAuthorizationError['Issue']>(error), {
            code: 'UNKNOWN',
            message: 'Access denied',
          });
        }
      },
    });
  });
});
