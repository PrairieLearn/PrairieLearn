import { Router } from 'express';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { config } from '../../lib/config.js';
import {
  createCourseFromRequest,
  selectPendingCourseRequests,
  updateCourseRequest,
  updateCourseRequestNote,
} from '../../lib/course-request.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { deleteCourse, insertCourse, selectCourseById } from '../../models/course.js';
import { selectAllInstitutions } from '../../models/institution.js';

import { AdministratorCourses, CourseWithInstitutionSchema } from './administratorCourses.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const course_requests = await selectPendingCourseRequests();
    const institutions = await selectAllInstitutions();
    const courses = await sqldb.queryRows(sql.select_courses, CourseWithInstitutionSchema);
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
          <AdministratorCourses
            courseRequests={course_requests}
            institutions={institutions}
            courses={courses}
            coursesRoot={config.coursesRoot}
            csrfToken={res.locals.__csrf_token}
            urlPrefix={res.locals.urlPrefix}
          />
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
    } else if (req.body.__action === 'approve_deny_course_request') {
      await updateCourseRequest({
        approveDenyAction: req.body.approve_deny_action,
        courseRequestId: req.body.request_id,
        authnUser: res.locals.authn_user,
      });
    } else if (req.body.__action === 'create_course_from_request') {
      const jobSequenceId = await createCourseFromRequest({
        courseRequestId: req.body.request_id,
        shortName: req.body.short_name,
        title: req.body.title,
        institutionId: req.body.institution_id,
        displayTimezone: req.body.display_timezone,
        path: req.body.path,
        repoShortName: req.body.repository_short_name,
        githubUser: req.body.github_user.length > 0 ? req.body.github_user : null,
        authnUser: res.locals.authn_user,
      });
      return res.redirect(`/pl/administrator/jobSequence/${jobSequenceId}/`);
    } else if (req.body.__action === 'update_course_request_note') {
      await updateCourseRequestNote({
        courseRequestId: req.body.request_id,
        note: req.body.note,
      });
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
    res.redirect(req.originalUrl);
  }),
);

export default router;
