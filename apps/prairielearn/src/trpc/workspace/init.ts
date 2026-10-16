import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import { appErrorFormatter } from '@prairielearn/trpc/server';

import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'workspace'>;
  res.set('Cache-Control', 'no-store');

  return {
    workspace_id: locals.workspace_id,
    locals,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: appErrorFormatter,
});

const requireWorkspaceAccess = t.middleware(async (opts) => {
  if (!opts.ctx.locals.workspace_access_authorized) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
  }
  return opts.next();
});

export const workspaceProcedure = t.procedure.use(requireWorkspaceAccess);
