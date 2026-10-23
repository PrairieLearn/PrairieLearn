import { TRPCError } from '@trpc/server';

import {
  areWorkspaceSpecificHostsEnabled,
  generateWorkspaceSandboxBootstrapJwt,
  getWorkspaceSandboxAuthorizationCookies,
  getWorkspaceSandboxOrigin,
} from '../../lib/workspace-sandbox.js';

import { t, workspaceProcedure } from './init.js';

const requireWorkspaceSpecificHosts = t.middleware(async ({ ctx, next }) => {
  if (!(await areWorkspaceSpecificHostsEnabled(ctx.locals))) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace-specific hosts are not enabled' });
  }

  return next();
});

const issueMutation = workspaceProcedure
  .use(requireWorkspaceSpecificHosts)
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
