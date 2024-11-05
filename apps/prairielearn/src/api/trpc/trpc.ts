import * as crypto from 'node:crypto';

import { initTRPC, TRPCError } from '@trpc/server';
import { type CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { type Request } from 'express';
import * as jose from 'jose';
import { z } from 'zod';

import { run } from '@prairielearn/run';

import { config } from '../../lib/config.js';
import { selectUserById } from '../../models/user.js';

function getJWT(req: Request) {
  if (!req.headers.authorization) return null;

  const [type, token] = req.headers.authorization.split(' ');
  if (type.toLowerCase() !== 'bearer') return null;

  return token || null;
}

export async function createContext({ req }: CreateExpressContextOptions) {
  return {
    jwt: getJWT(req),
    bypassJwt: false,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const privateProcedure = t.procedure.use(async (opts) => {
  if (opts.ctx.bypassJwt) return opts.next();

  if (!config.internalApiSecretKey) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal API secret key is not configured',
    });
  }

  if (!opts.ctx.jwt) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Requires authentication',
    });
  }

  // Verify the JWT.
  await jose
    .jwtVerify(opts.ctx.jwt, crypto.createSecretKey(config.internalApiSecretKey, 'utf-8'), {
      issuer: 'PrairieLearn',
    })
    .catch((err) => {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: `Invalid JWT: ${err.message}`,
      });
    });

  return opts.next();
});

export async function selectUsers({
  user_id,
  authn_user_id,
}: {
  user_id: string;
  authn_user_id: string;
}) {
  const user = await selectUserById(user_id);

  const authn_user = await run(async () => {
    if (user_id === authn_user_id) return user;

    return await selectUserById(authn_user_id);
  });

  return { user, authn_user };
}
