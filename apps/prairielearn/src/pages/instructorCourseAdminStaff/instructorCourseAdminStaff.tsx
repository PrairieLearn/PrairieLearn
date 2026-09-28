import { Router } from 'express';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffUserSchema } from '../../lib/client/safe-db-types.js';
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
    oneOfPermissions: ['has_course_permission_preview', 'has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course' | 'course-instance'>(async (req, res) => {
    const { authz_data: authzData, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const courseUsers = (await selectCourseUsers({ course_id: course.id })).map((row) => ({
      ...row,
      user: StaffUserSchema.parse(row.user),
    }));

    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course,
      authzData,
    });

    const courseInstanceId = res.locals.course_instance?.id;
    const trpcUrl = getCourseTrpcUrl(course.id, courseInstanceId);
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
              courseId={course.id}
              courseInstanceId={courseInstanceId}
              courseInstances={courseInstances}
              courseUsers={courseUsers}
              authnUserId={res.locals.authn_user.id}
              userId={res.locals.user.id}
              isAdministrator={authzData.is_administrator || authzData.is_institution_administrator}
              canEdit={authzData.has_course_permission_own}
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
