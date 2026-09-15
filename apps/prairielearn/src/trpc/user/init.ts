import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import { appErrorFormatter } from '@prairielearn/trpc/server';

import { UserSchema } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'plain'>;
  return {
    authn_user: locals.authn_user,
    locals,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: appErrorFormatter,
});

export const requireAuthenticatedUser = t.middleware((opts) => {
  const authnUser = UserSchema.safeParse(opts.ctx.authn_user);
  if (!authnUser.success) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return opts.next({ ctx: { ...opts.ctx, authn_user: authnUser.data } });
});
