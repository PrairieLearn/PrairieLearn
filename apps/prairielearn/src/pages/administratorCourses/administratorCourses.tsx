import { Router } from 'express';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { AdminInstitutionSchema } from '../../lib/client/safe-db-types.js';
import { config } from '../../lib/config.js';
import { selectPendingCourseRequests } from '../../lib/course-request.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { deleteCourse, insertCourse, selectCourseById } from '../../models/course.js';
import { selectAllInstitutions } from '../../models/institution.js';

import { AdministratorCourses } from './administratorCourses.html.js';
import { CourseWithInstitutionSchema } from './administratorCourses.shared.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const course_requests = await selectPendingCourseRequests();
    const institutions = await selectAllInstitutions();
    const courses = await sqldb.queryRows(sql.select_courses, CourseWithInstitutionSchema);
    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: `${res.locals.urlPrefix}/administrator/courseRequests/trpc`,
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
    );
    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Courses',
        navContext: {
          type: 'administrator',
          page: 'admin',
          subPage: 'courses',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <Hydrate>
            <AdministratorCourses
              courseRequests={course_requests}
              institutions={AdminInstitutionSchema.array().parse(institutions)}
              courses={courses}
              coursesRoot={config.coursesRoot}
              csrfToken={res.locals.__csrf_token}
              trpcCsrfToken={trpcCsrfToken}
              urlPrefix={res.locals.urlPrefix}
              courseRepoDefaultBranch={config.courseRepoDefaultBranch}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    if (req.body.__action === 'courses_insert') {
      await insertCourse({
        institution_id: req.body.institution_id,
        short_name: req.body.short_name,
        title: req.body.title,
        display_timezone: req.body.display_timezone,
        path: req.body.path,
        repository: req.body.repository,
        branch: req.body.branch,
        authn_user_id: res.locals.authn_user.id,
      });
    } else if (req.body.__action === 'courses_update_column') {
      await sqldb.callAsync('courses_update_column', [
        req.body.course_id,
        req.body.column_name,
        req.body.value,
        res.locals.authn_user.id,
      ]);
    } else if (req.body.__action === 'courses_delete') {
      const course = await selectCourseById(req.body.course_id);
      if (req.body.confirm_short_name !== course.short_name) {
        throw new error.HttpStatusError(
          400,
          `deletion aborted: confirmation string "${req.body.confirm_short_name}" did not match expected value of "${course.short_name}"`,
        );
      }
      await deleteCourse({
        course_id: req.body.course_id,
        authn_user_id: res.locals.authn_user.id,
      });
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
    res.redirect(req.originalUrl);
  }),
);

export default router;
