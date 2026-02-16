import { Router } from 'express';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
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
    const { authz_data: authzData, __csrf_token: csrfToken } = extractPageContext(res.locals, {
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
              csrfToken={csrfToken}
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
    oneOfPermissions: ['has_course_permission_view', 'has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const { authz_data: authzData } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    if (!authzData.has_course_permission_edit || !authzData.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a course and course instance editor)');
    }
    flash('success', 'AI grading settings saved');
    res.redirect(req.originalUrl);
  }),
);

export default router;
