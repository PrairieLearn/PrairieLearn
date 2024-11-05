import * as crypto from 'node:crypto';

import { initTRPC, TRPCError } from '@trpc/server';
import { type CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { type Request } from 'express';
import * as jose from 'jose';
import { z } from 'zod';

import { run } from '@prairielearn/run';

import { config } from '../../lib/config.js';
import { selectCourseById } from '../../models/course.js';
import { selectUserById } from '../../models/user.js';

function getJWT(req: Request) {
  if (!req.headers.authorization) return null;

  const [type, token] = req.headers.authorization.split(' ');
  if (type.toLowerCase() !== 'bearer') return null;

  return token || null;
}

export async function createContext({ req, res }: CreateExpressContextOptions) {
  return {
    req,
    res,
    jwt: getJWT(req),
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const privateProcedure = t.procedure.use(async (opts) => {
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

export const courseProcedure = t.procedure
  .input(z.object({ course_id: z.string() }))
  .use(async (opts) => {
    const course = await selectCourseById(opts.input.course_id);

    return opts.next({
      ctx: {
        course,
      },
    });
  });

export const userProcedure = t.procedure
  .input(z.object({ user_id: z.string(), authn_user_id: z.string() }))
  .use(async (opts) => {
    const user = await selectUserById(opts.input.user_id);

    const authn_user = await run(async () => {
      if (opts.input.authn_user_id && opts.input.authn_user_id !== user.user_id) {
        return await selectUserById(opts.input.authn_user_id);
      }

      return null;
    });

    return opts.next({
      ctx: {
        user,
        authn_user,
      },
    });
  });
