import * as crypto from 'node:crypto';

import { TRPCError, initTRPC } from '@trpc/server';
import { type CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { type Request } from 'express';
import * as jose from 'jose';

import { run } from '@prairielearn/run';

import { config } from '../../lib/config.js';
import { selectUserById } from '../../models/user.js';

function getJWT(req: Request) {
  if (!req.headers.authorization) return null;

  const [type, token] = req.headers.authorization.split(' ');
  if (type.toLowerCase() !== 'bearer') return null;

  return token || null;
}

export function createContext({ req }: CreateExpressContextOptions) {
  return {
    jwt: getJWT(req),
    bypassJwt: false,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;

export const privateProcedure = t.procedure.use(async (opts) => {
  // When running in the same process, we can bypass JWT verification.
  if (opts.ctx.bypassJwt) return opts.next();

  if (!config.trpcSecretKeys?.length) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal API secret keys are not configured',
    });
  }

  if (!opts.ctx.jwt) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Requires authentication',
    });
  }

  for (const secretKey of config.trpcSecretKeys) {
    try {
      await jose.jwtVerify(opts.ctx.jwt, crypto.createSecretKey(secretKey, 'utf-8'), {
        issuer: 'PrairieLearn',
      });

      // The payload was successfully verified. We can proceed.
      return opts.next();
    } catch {
      // Ignore errors and try the next key.
    }
  }

  // We weren't able to verify the JWT with any of the secret keys.
  throw new TRPCError({
    code: 'UNAUTHORIZED',
    message: 'Invalid JWT',
  });
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
