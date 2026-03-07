import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { EnumAiGradingProviderSchema } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import { encryptForStorage } from '../../../lib/storage-crypt.js';
import {
  deleteCredential,
  updateUseCustomApiKeys,
  upsertCredential,
} from '../../../models/ai-grading-credentials.js';
import {
  selectCreditPool,
  selectCreditPoolChangesBatched,
  selectDailySpending,
} from '../../../models/ai-grading-credit-pool.js';

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

const requireAiGradingFeature = t.middleware(async (opts) => {
  const enabled = await features.enabled('ai-grading', {
    institution_id: opts.ctx.course.institution_id,
    course_id: opts.ctx.course.id,
    course_instance_id: opts.ctx.course_instance.id,
    user_id: opts.ctx.authn_user.id,
  });

  if (!enabled) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (feature not available)',
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
      secret_key: z.string().min(1),
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
    });
  });

const creditPoolQuery = t.procedure.use(requireAiGradingFeature).query(async (opts) => {
  const pool = await selectCreditPool(opts.ctx.course_instance.id);
  return pool;
});

const creditPoolChangesQuery = t.procedure
  .use(requireAiGradingFeature)
  .input(z.object({ page: z.number().int().min(1).default(1) }))
  .query(async (opts) => {
    return await selectCreditPoolChangesBatched(opts.ctx.course_instance.id, opts.input.page);
  });

const dailySpendingQuery = t.procedure
  .use(requireAiGradingFeature)
  .input(
    z.object({
      days: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(30),
    }),
  )
  .query(async (opts) => {
    return await selectDailySpending(opts.ctx.course_instance.id, opts.input.days);
  });

export const aiGradingSettingsRouter = t.router({
  updateUseCustomApiKeys: updateUseCustomApiKeysMutation,
  addCredential: addCredentialMutation,
  deleteCredential: deleteCredentialMutation,
  creditPool: creditPoolQuery,
  creditPoolChanges: creditPoolChangesQuery,
  dailySpending: dailySpendingQuery,
});

export type AiGradingSettingsRouter = typeof aiGradingSettingsRouter;
