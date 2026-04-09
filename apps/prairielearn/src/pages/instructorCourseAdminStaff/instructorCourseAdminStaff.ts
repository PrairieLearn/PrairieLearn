import { Router } from 'express';

import * as sqldb from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { extractPageContext } from '../../lib/client/page-context.js';
import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';

import { InstructorCourseAdminStaff } from './instructorCourseAdminStaff.html.js';
import { CourseUsersRowSchema } from './instructorCourseAdminStaff.types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
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

    const courseUsers = await sqldb.queryRows(
      sql.select_course_users,
      { course_id: res.locals.course.id },
      CourseUsersRowSchema,
    );

    const trpcUrl = getCourseTrpcUrl(res.locals.course.id);
    const trpcCsrfToken = generatePrefixCsrfToken(
      { url: trpcUrl, authn_user_id: res.locals.authn_user.id },
      config.secretKey,
    );

    res.send(
      InstructorCourseAdminStaff({
        resLocals: res.locals,
        courseInstances,
        courseUsers,
        uidsLimit: MAX_UIDS,
        search: getUrl(req).search,
        trpcCsrfToken,
        courseId: res.locals.course.id,
      }),
    );
  }),
);

export default router;
