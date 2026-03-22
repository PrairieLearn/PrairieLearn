import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';

import * as error from '@prairielearn/error';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../../components/PageLayout.js';
import { extractPageContext } from '../../../lib/client/page-context.js';
import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { handleTrpcError } from '../../../lib/trpc.js';
import { createAuthzMiddleware } from '../../../middlewares/authzHelper.js';
import { selectCredentials } from '../../../models/ai-grading-credentials.js';

import { InstructorInstanceAdminAiGrading } from './instructorInstanceAdminAiGrading.html.js';
import { aiGradingSettingsRouter, createContext } from './trpc.js';
import { formatCredential, formatCredentialRedacted } from './utils/format.js';

const router = Router();

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
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
    } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const canEdit = authzData.has_course_permission_own;

    const aiGradingModelSelectionEnabled = await features.enabled('ai-grading-model-selection', {
      institution_id: course.institution_id,
      course_id: course.id,
      course_instance_id: courseInstance.id,
      user_id: authn_user.id,
    });

    const dbCredentials = await selectCredentials(courseInstance.id);
    const credentials = dbCredentials.map((c) =>
      canEdit
        ? formatCredential(c, courseInstance.display_timezone)
        : formatCredentialRedacted(c, courseInstance.display_timezone),
    );

    // Generate a prefix-based CSRF token scoped to the tRPC endpoint for this page.
    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: req.originalUrl.split('?')[0] + '/trpc',
        authn_user_id: authn_user.id,
      },
      config.secretKey,
    );

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
              trpcCsrfToken={trpcCsrfToken}
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

router.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: aiGradingSettingsRouter,
    createContext,
    onError: handleTrpcError,
  }),
);

export default router;
