import { Router } from 'express';

import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { InstructorInstanceAdminAiGrading } from './instructorInstanceAdminAiGrading.html.js';
import type { AiGradingApiKeyCredential } from './instructorInstanceAdminAiGrading.types.js';

const router = Router();

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_view', 'has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const { authz_data: authzData } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const canEdit =
      authzData.has_course_permission_edit && authzData.has_course_instance_permission_edit;

    const initialApiKeyCredentials: AiGradingApiKeyCredential[] = [];

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
              initialUseCustomApiKeys={false}
              initialApiKeyCredentials={initialApiKeyCredentials}
              canEdit={!!canEdit}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
