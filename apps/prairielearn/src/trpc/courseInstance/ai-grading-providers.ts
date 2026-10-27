import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import {
  discoverAiGradingModels,
  normalizeAiGradingBaseUrl,
} from '../../ee/lib/ai-grading/ai-grading-model-discovery.js';
import { formatCredential } from '../../ee/pages/instructorInstanceAdminAiGrading/utils/format.js';
import { StaffAiGradingCredentialSchema } from '../../lib/client/safe-db-types.js';
import { decryptFromStorage, encryptForStorage } from '../../lib/encrypted-storage.js';
import { features } from '../../lib/features/index.js';
import {
  AiGradingCredentialConflictError,
  deleteCredential,
  replaceCustomCredential,
  selectCredentials,
  selectOptionalCredential,
} from '../../models/ai-grading-credentials.js';

import { requireCourseInstancePermissionEdit, requireCoursePermissionOwn, t } from './init.js';

export interface AiGradingProvidersError {
  List: never;
  Discover: never;
  Save: never;
  Models: never;
  Destroy: never;
}

const featureProcedure = t.procedure.use(async (opts) => {
  if (
    !(await features.enabled('ai-grading', {
      institution_id: opts.ctx.course.institution_id,
      course_id: opts.ctx.course.id,
      course_instance_id: opts.ctx.course_instance.id,
      user_id: opts.ctx.locals.authn_user.id,
    }))
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied (feature not available)' });
  }
  return opts.next();
});

const connectionSchema = z.object({
  base_url: z.string().trim().min(1),
  secret_key: z.string().trim().min(1),
});
const credentialIdSchema = z.object({ credential_id: IdSchema });
const customProviderMetadataSchema = StaffAiGradingCredentialSchema.pick({
  id: true,
  provider: true,
  base_url: true,
});
const modelsSchema = z.object({ models: z.array(z.string()) });

async function getCustomCredential(course_instance_id: string, credential_id: string) {
  const credential = await selectOptionalCredential({ course_instance_id, credential_id });
  if (credential?.provider !== 'openai-compatible' || credential.base_url === null) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message:
        'Custom provider configuration not found. Refresh the page and select a provider again.',
    });
  }
  return { ...credential, base_url: credential.base_url };
}

export const aiGradingProvidersRouter = t.router({
  list: featureProcedure
    .use(requireCourseInstancePermissionEdit)
    .output(z.object({ credential: customProviderMetadataSchema.nullable() }))
    .query(async ({ ctx }) => {
      const credential = (await selectCredentials(ctx.course_instance.id)).find(
        (c) => c.provider === 'openai-compatible',
      );
      return { credential: credential ? customProviderMetadataSchema.parse(credential) : null };
    }),
  discover: featureProcedure
    .use(requireCoursePermissionOwn)
    .input(connectionSchema)
    .output(modelsSchema)
    .mutation(async ({ ctx, input }) => ({
      models: await discoverAiGradingModels({
        baseUrl: input.base_url,
        apiKey: input.secret_key,
        courseInstanceId: ctx.course_instance.id,
      }),
    })),
  save: featureProcedure
    .use(requireCoursePermissionOwn)
    .input(connectionSchema.extend({ expected_credential_id: IdSchema.nullable() }))
    .output(z.object({ credential: StaffAiGradingCredentialSchema }))
    .mutation(async ({ ctx, input }) => {
      // Recheck the submitted connection outside the transaction; never trust the client's catalog.
      await discoverAiGradingModels({
        baseUrl: input.base_url,
        apiKey: input.secret_key,
        courseInstanceId: ctx.course_instance.id,
      });
      try {
        const credential = await replaceCustomCredential({
          course_instance_id: ctx.course_instance.id,
          expected_credential_id: input.expected_credential_id,
          base_url: normalizeAiGradingBaseUrl(input.base_url),
          encrypted_secret_key: encryptForStorage(input.secret_key),
          created_by: ctx.locals.authn_user.id,
        });
        const formatted = formatCredential(credential, ctx.course_instance.display_timezone);
        return {
          credential: StaffAiGradingCredentialSchema.parse({
            ...credential,
            apiKeyMasked: formatted.apiKeyMasked,
            dateAdded: formatted.dateAdded,
          }),
        };
      } catch (error) {
        if (error instanceof AiGradingCredentialConflictError) {
          throw new TRPCError({ code: 'CONFLICT', message: error.message });
        }
        throw error;
      }
    }),
  models: featureProcedure
    .use(requireCourseInstancePermissionEdit)
    .input(credentialIdSchema)
    .output(modelsSchema)
    .query(async ({ ctx, input }) => {
      const credential = await getCustomCredential(ctx.course_instance.id, input.credential_id);
      return {
        models: await discoverAiGradingModels({
          baseUrl: credential.base_url,
          apiKey: decryptFromStorage(credential.encrypted_secret_key),
          courseInstanceId: ctx.course_instance.id,
        }),
      };
    }),
  destroy: featureProcedure
    .use(requireCoursePermissionOwn)
    .input(credentialIdSchema)
    .mutation(async ({ ctx, input }) => {
      await getCustomCredential(ctx.course_instance.id, input.credential_id);
      await deleteCredential({
        course_instance_id: ctx.course_instance.id,
        credential_id: input.credential_id,
        authn_user_id: ctx.locals.authn_user.id,
      });
    }),
});
