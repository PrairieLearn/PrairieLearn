import { TRPCError } from '@trpc/server';

import { config } from '../../lib/config.js';
import {
  generateWorkspaceSandboxBootstrapJwt,
  getWorkspaceSandboxCookieMaxAgeMilliseconds,
  getWorkspaceSandboxOrigin,
} from '../../lib/workspace-sandbox.js';
import { selectOptionalWorkspace } from '../../models/workspace.js';

import { t, workspaceProcedure } from './init.js';

export interface WorkspaceAuthorizationError {
  Issue: never;
}

const issueMutation = workspaceProcedure.mutation(async ({ ctx }) => {
  if (config.workspaceIsolationMode !== 'cross-origin') {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace sandboxing is not enabled' });
  }

  const workspace = await selectOptionalWorkspace(ctx.workspace_id);
  if (workspace?.state !== 'running') {
    throw new TRPCError({ code: 'CONFLICT', message: 'Workspace is not running' });
  }

  const sandboxOrigin = getWorkspaceSandboxOrigin({
    workspaceId: workspace.id,
  });
  return {
    authorizationMaxAgeMilliseconds: getWorkspaceSandboxCookieMaxAgeMilliseconds(),
    bootstrapUrl: `${sandboxOrigin}/bootstrap`,
    jwt: await generateWorkspaceSandboxBootstrapJwt({ workspaceId: workspace.id }),
    sandboxOrigin,
  };
});

export const authorizationRouter = t.router({
  issue: issueMutation,
});
