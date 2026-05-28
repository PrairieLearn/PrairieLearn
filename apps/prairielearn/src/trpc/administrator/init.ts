import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { appErrorFormatter } from '../app-errors.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'plain'>;
  return {
    authn_user: locals.authn_user,
    is_administrator: locals.is_administrator,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: appErrorFormatter,
});

export const requireAdministrator = t.middleware((opts) => {
  if (!opts.ctx.is_administrator) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied (must be an administrator)' });
  }
  return opts.next();
});
