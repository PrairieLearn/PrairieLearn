import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { EnumAiGradingProviderSchema } from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import { encryptForStorage } from '../../../lib/storage-crypt.js';
import {
  deleteCredential,
  updateUseCustomApiKeys,
  upsertCredential,
} from '../../../models/ai-grading-credentials.js';
import { creditPoolProcedures, requireAiGradingFeature } from '../../lib/credit-pool-trpc.js';

import { formatCredential } from './utils/format.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'course-instance'>;

  return {
    course: locals.course,
    course_instance: locals.course_instance,
    authn_user: locals.authn_user,
    authz_data: locals.authz_data,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const requireEditPermission = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_own) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied',
    });
  }
  return opts.next();
});

const updateUseCustomApiKeysMutation = t.procedure
  .use(requireEditPermission)
  .use(requireAiGradingFeature)
  .input(z.object({ enabled: z.boolean() }))
  .mutation(async (opts) => {
    await updateUseCustomApiKeys({
      course_instance_id: opts.ctx.course_instance.id,
      ai_grading_use_custom_api_keys: opts.input.enabled,
    });
    return { useCustomApiKeys: opts.input.enabled };
  });

const addCredentialMutation = t.procedure
  .use(requireEditPermission)
  .use(requireAiGradingFeature)
  .input(
    z.object({
      provider: EnumAiGradingProviderSchema,
      secret_key: z.string().trim().min(1),
    }),
  )
  .mutation(async (opts) => {
    const encrypted = encryptForStorage(opts.input.secret_key);
    const row = await upsertCredential({
      course_instance_id: opts.ctx.course_instance.id,
      provider: opts.input.provider,
      encrypted_secret_key: encrypted,
      created_by: opts.ctx.authn_user.id,
    });
    return {
      credential: formatCredential(row, opts.ctx.course_instance.display_timezone),
    };
  });

const deleteCredentialMutation = t.procedure
  .use(requireEditPermission)
  .use(requireAiGradingFeature)
  .input(z.object({ credential_id: z.string() }))
  .mutation(async (opts) => {
    await deleteCredential({
      credential_id: opts.input.credential_id,
      course_instance_id: opts.ctx.course_instance.id,
      authn_user_id: opts.ctx.authn_user.id,
    });
  });

export const aiGradingSettingsRouter = t.router({
  ...creditPoolProcedures,
  updateUseCustomApiKeys: updateUseCustomApiKeysMutation,
  addCredential: addCredentialMutation,
  deleteCredential: deleteCredentialMutation,
});

export type AiGradingSettingsRouter = typeof aiGradingSettingsRouter;
