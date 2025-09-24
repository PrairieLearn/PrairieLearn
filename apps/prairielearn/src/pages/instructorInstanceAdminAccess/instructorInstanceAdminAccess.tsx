import assert from 'assert';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { CourseInstanceAccessRuleSchema } from '../../lib/db-types.js';

import { InstructorInstanceAdminAccess } from './instructorInstanceAdminAccess.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await queryRows(
      sql.course_instance_access_rules,
      { course_instance_id: res.locals.course_instance.id },
      CourseInstanceAccessRuleSchema,
    );

    const {
      authz_data: { has_course_instance_permission_view: hasCourseInstancePermissionView },
    } = getPageContext(res.locals);

    assert(hasCourseInstancePermissionView !== undefined);
    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');
    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Access',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'access',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <>
            <CourseInstanceSyncErrorsAndWarnings
              authzData={res.locals.authz_data}
              courseInstance={res.locals.course_instance}
              course={res.locals.course}
              urlPrefix={res.locals.urlPrefix}
            />
            <InstructorInstanceAdminAccess
              accessRules={accessRules}
              courseInstance={courseInstance}
              hasCourseInstancePermissionView={hasCourseInstancePermissionView}
            />
          </>
        ),
      }),
    );
  }),
);

export default router;
