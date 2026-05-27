import { Router } from 'express';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectCourseUsers } from '../../models/course-permissions.js';

import { StaffTable } from './StaffTable.js';

const router = Router();

const MAX_UIDS = 100;

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_own'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course'>(async (req, res) => {
    const { authz_data: authzData, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course,
      authzData,
      requiredRole: ['Owner'],
    });

    const courseUsers = await selectCourseUsers({ course_id: res.locals.course.id });

    const trpcUrl = getCourseTrpcUrl(res.locals.course.id);
    const trpcCsrfToken = generatePrefixCsrfToken(
      { url: trpcUrl, authn_user_id: res.locals.authn_user.id },
      config.secretKey,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Staff',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'staff',
        },
        options: {
          fullWidth: true,
          fullHeight: true,
        },
        content: (
          <Hydrate fullHeight>
            <StaffTable
              trpcCsrfToken={trpcCsrfToken}
              courseId={res.locals.course.id}
              courseInstances={courseInstances}
              courseUsers={courseUsers}
              authnUserId={res.locals.authn_user.id}
              userId={res.locals.user.id}
              isAdministrator={res.locals.is_administrator}
              uidsLimit={MAX_UIDS}
              search={getUrl(req).search}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
