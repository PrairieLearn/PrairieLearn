import { TRPCError } from '@trpc/server';

import {
  generateWorkspaceSandboxBootstrapJwt,
  getWorkspaceSandboxAuthorizationCookies,
  getWorkspaceSandboxOrigin,
  isWorkspaceIsolationEnabled,
} from '../../lib/workspace-sandbox.js';

import { t, workspaceProcedure } from './init.js';

export interface WorkspaceAuthorizationError {
  Issue: never;
}

const requireWorkspaceIsolation = t.middleware(async ({ ctx, next }) => {
  if (!(await isWorkspaceIsolationEnabled(ctx.locals))) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace sandboxing is not enabled' });
  }

  return next();
});

const issueMutation = workspaceProcedure
  .use(requireWorkspaceIsolation)
  .mutation(async ({ ctx }) => {
    if (!ctx.sessionId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session is not available' });
    }

    if (ctx.locals.workspace_state !== 'running') {
      throw new TRPCError({ code: 'CONFLICT', message: 'Workspace is not running' });
    }

    const sandboxOrigin = getWorkspaceSandboxOrigin({
      workspaceId: ctx.workspace_id,
    });
    return {
      bootstrapUrl: `${sandboxOrigin}/bootstrap`,
      jwt: await generateWorkspaceSandboxBootstrapJwt({
        authorizationCookies: getWorkspaceSandboxAuthorizationCookies(ctx.authorizationCookies),
        publicQuestionEndpoint: ctx.publicQuestionEndpoint,
        sessionId: ctx.sessionId,
        workspaceId: ctx.workspace_id,
      }),
      sandboxOrigin,
    };
  });

export const authorizationRouter = t.router({
  issue: issueMutation,
});
