import { Router } from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import {
  AI_GRADING_PROVIDER_DISPLAY_NAMES,
  type AiGradingApiKeyCredential,
  type AiGradingProvider,
} from '../../ee/lib/ai-grading/ai-grading-models.shared.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import {
  CourseInstanceAiGradingCredentialSchema,
  CourseInstanceSchema,
  EnumAiGradingProviderSchema,
} from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { decryptFromStorage, encryptForStorage } from '../../lib/storage-crypt.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { InstructorInstanceAdminAiGrading } from './instructorInstanceAdminAiGrading.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

function maskApiKey(key: string): string {
  if (key.length <= 7) return '.'.repeat(7);
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

function formatCredential(cred: {
  id: string;
  provider: string;
  encrypted_secret_key: string;
  created_at: Date;
}): AiGradingApiKeyCredential {
  const decrypted = decryptFromStorage(cred.encrypted_secret_key);
  return {
    id: cred.id,
    provider: AI_GRADING_PROVIDER_DISPLAY_NAMES[cred.provider as AiGradingProvider],
    providerValue: cred.provider,
    apiKeyMasked: maskApiKey(decrypted),
    dateAdded: cred.created_at.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  };
}

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_view', 'has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    if (!aiGradingEnabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }

    const {
      course_instance: courseInstance,
      course,
      authz_data: authzData,
      authn_user,
      __csrf_token,
    } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const canEdit =
      authzData.has_course_permission_edit && authzData.has_course_instance_permission_edit;

    const aiGradingModelSelectionEnabled = await features.enabled('ai-grading-model-selection', {
      institution_id: course.institution_id,
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: authn_user.id,
    });

    const dbCredentials = await sqldb.queryRows(
      sql.select_credentials,
      { course_instance_id: courseInstance.id },
      CourseInstanceAiGradingCredentialSchema,
    );

    const credentials = dbCredentials.map(formatCredential);

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'AI grading',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'ai_grading',
        },
        content: (
          <Hydrate>
            <InstructorInstanceAdminAiGrading
              csrfToken={__csrf_token}
              initialUseCustomApiKeys={courseInstance.ai_grading_use_custom_api_keys}
              initialApiKeyCredentials={credentials}
              canEdit={!!canEdit}
              isDevMode={config.devMode}
              aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_edit', 'has_course_instance_permission_edit'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    if (!aiGradingEnabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }

    const { course_instance: courseInstance, authz_data: authzData } = extractPageContext(
      res.locals,
      {
        pageType: 'courseInstance',
        accessType: 'instructor',
      },
    );

    if (!authzData.has_course_permission_edit || !authzData.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied');
    }

    if (req.body.__action === 'update_use_custom_api_keys') {
      const { ai_grading_use_custom_api_keys } = z
        .object({ ai_grading_use_custom_api_keys: z.boolean() })
        .parse(req.body);

      await sqldb.queryRow(
        sql.update_use_custom_api_keys,
        {
          course_instance_id: courseInstance.id,
          ai_grading_use_custom_api_keys,
        },
        CourseInstanceSchema,
      );

      res.json({ useCustomApiKeys: ai_grading_use_custom_api_keys });
    } else if (req.body.__action === 'add_credential') {
      const { provider, secret_key } = z
        .object({
          provider: EnumAiGradingProviderSchema,
          secret_key: z.string().min(1),
        })
        .parse(req.body);

      const encrypted = await encryptForStorage(secret_key);

      const row = await sqldb.queryRow(
        sql.upsert_credential,
        {
          course_instance_id: courseInstance.id,
          provider,
          encrypted_secret_key: encrypted,
        },
        CourseInstanceAiGradingCredentialSchema,
      );

      res.json({ credential: formatCredential(row) });
    } else if (req.body.__action === 'delete_credential') {
      const { credential_id } = z.object({ credential_id: z.string() }).parse(req.body);

      await sqldb.execute(sql.delete_credential, {
        credential_id,
        course_instance_id: courseInstance.id,
      });

      res.json({ deleted: true });
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
