import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { type HtmlSafeString, html, joinHtml } from '@prairielearn/html';
import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { type PageAuthzData, hasRole, makePageAuthzData } from '../../../lib/authz-data-lib.js';
import { constructCourseOrInstanceContext } from '../../../lib/authz-data.js';
import {
  type Course,
  CourseInstanceSchema,
  Lti13CourseInstanceSchema,
} from '../../../lib/db-types.js';
import { selectCourseInstancesWithStaffAccess } from '../../../models/course-instances.js';
import { selectCoursesWithEditAccess } from '../../../models/course.js';
import { Lti13Claim } from '../../lib/lti13.js';

import {
  Lti13CourseNavigationDone,
  Lti13CourseNavigationInstructor,
  Lti13CourseNavigationNotReady,
} from './lti13CourseNavigation.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

function prettyCourseName(ltiClaim: Lti13Claim) {
  const context = ltiClaim.context;

  if (!context) {
    return '(no context)';
  }

  if (context.label && context.title) {
    return `${context.label}: ${context.title}`;
  } else if (context.label) {
    return context.label;
  } else if (context.title) {
    return context.title;
  } else {
    return 'your course';
  }
}

async function courseInstancesAllowedToLink({
  course,
  authzData,
}: {
  course: Course;
  authzData: PageAuthzData;
}) {
  const course_instances = await selectCourseInstancesWithStaffAccess({
    course,
    authzData,
    requiredRole: ['Previewer', 'Student Data Viewer'],
  });

  return course_instances.filter((ci) => ci.has_course_instance_permission_edit);
}

async function coursesAllowedToLink({
  user_id,
  is_administrator,
}: {
  user_id: string;
  is_administrator: boolean;
}) {
  const courses = await selectCoursesWithEditAccess({
    user_id,
    is_administrator,
  });

  return courses.filter((c) => c.permissions_course.has_course_permission_edit);
}

router.get(
  '/course_instances',
  asyncHandler(async (req, res) => {
    const unsafe_course_id = req.query.unsafe_course_id?.toString();
    if (!unsafe_course_id) {
      throw new HttpStatusError(400, 'Missing required parameter: unsafe_course_id');
    }

    const { authzData, course } = await constructCourseOrInstanceContext({
      user: res.locals.authn_user,
      course_id: unsafe_course_id,
      course_instance_id: null,
      ip: req.ip || null,
      req_date: res.locals.req_date,
      is_administrator: res.locals.is_administrator,
    });

    if (!authzData || !hasRole(authzData, ['Editor'])) {
      throw new HttpStatusError(403, 'Access denied');
    }

    const course_instances = await courseInstancesAllowedToLink({
      course,
      authzData: makePageAuthzData({
        authzData,
        is_administrator: res.locals.is_administrator,
      }),
    });

    let options: HtmlSafeString;

    if (course_instances.length === 0) {
      options = html`<option disabled selected value="">
        No course instances found where you have student data editor permissions.
      </option>`;
    } else {
      options = joinHtml(
        course_instances.map((ci) => {
          return html`<option value="${ci.id}">${ci.short_name}: ${ci.long_name}</option>`;
        }),
      );
    }

    res.send(options.toString());
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if ('done' in req.query) {
      res.send(
        Lti13CourseNavigationDone({
          resLocals: res.locals,
          lti13_instance_id: req.params.lti13_instance_id,
        }),
      );
      return;
    }

    const ltiClaim = new Lti13Claim(req);
    const courseName = prettyCourseName(ltiClaim);
    const role_instructor = ltiClaim.isRoleInstructor();

    // Get lti13_course_instance info, if present
    const lti13_course_instance = await queryOptionalRow(
      sql.select_lti13_course_instance,
      {
        lti13_instance_id: req.params.lti13_instance_id,
        deployment_id: ltiClaim.deployment_id,
        context_id: ltiClaim.context?.id,
      },
      Lti13CourseInstanceSchema,
    );

    if (lti13_course_instance) {
      // Update lti13_course_instance on instructor login
      // helpful as LMS updates or we add features
      if (role_instructor) {
        await execute(sql.update_lti13_course_instance, {
          lti13_instance_id: req.params.lti13_instance_id,
          course_instance_id: lti13_course_instance.course_instance_id,
          deployment_id: ltiClaim.deployment_id,
          context_id: ltiClaim.context?.id,
          context_label: ltiClaim.context?.label,
          context_title: ltiClaim.context?.title,
          lineitems_url: ltiClaim.lineitems,
          context_memberships_url: ltiClaim.context_memberships_url,
        });

        // TODO: Set course/instance staff permissions for LMS course staff here?
      }

      // LTI claims are not used after this page so remove them from the session
      ltiClaim.remove();

      // Redirect to linked course instance
      res.redirect(
        `/pl/course_instance/${lti13_course_instance.course_instance_id}/${
          role_instructor ? 'instructor/' : ''
        }`,
      );
      return;
    }

    // Students get a "come back later" message
    if (!role_instructor) {
      res.send(
        Lti13CourseNavigationNotReady({
          resLocals: res.locals,
          courseName,
          ltiRoles: ltiClaim.roles,
        }),
      );
      return;
    }

    // Instructors get a prompt for linking
    res.send(
      Lti13CourseNavigationInstructor({
        resLocals: res.locals,
        courseName,
        courses: await coursesAllowedToLink({
          user_id: res.locals.authn_user.id,
          is_administrator: res.locals.is_administrator,
        }),
        lti13_instance_id: req.params.lti13_instance_id,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { authzData, courseInstance } = await constructCourseOrInstanceContext({
      user: res.locals.authn_user,
      course_id: null,
      course_instance_id: req.body.unsafe_course_instance_id,
      ip: req.ip || null,
      req_date: res.locals.req_date,
      is_administrator: res.locals.is_administrator,
    });

    if (!authzData || !hasRole(authzData, ['Editor', 'Student Data Editor']) || !courseInstance) {
      throw new HttpStatusError(403, 'Access denied');
    }

    // Ensure that the selected course instance transitively belongs to the institution
    // to which the LTI 1.3 instance belongs.
    const course_instance = await queryOptionalRow(
      sql.select_lti13_institution_course_instance,
      {
        course_instance_id: courseInstance.id,
        lti13_instance_id: req.params.lti13_instance_id,
        authn_lti13_instance_id: req.session.authn_lti13_instance_id,
      },
      CourseInstanceSchema,
    );

    if (course_instance == null) {
      throw new HttpStatusError(403, 'Access denied');
    }

<<<<<<< HEAD
    const ltiClaim = new Lti13Claim(req);
    if (ltiClaim.isRoleInstructor()) {
=======
    const courseInstancesAllowed = await courseInstancesAllowedToLink({
      course: await selectCourseById(course_instance.course_id),
      authzData,
    });
    const hasCourseInstanceAllowed = courseInstancesAllowed.some(
      (ci) => ci.id === course_instance.id,
    );

    const coursesAllowed = await coursesAllowedToLink({
      user_id: authzData.authn_user.id,
      is_administrator: res.locals.is_administrator,
    });
    const hasCourseAllowed = coursesAllowed.some((c) => c.id === course_instance.course_id);

    if (ltiClaim.isRoleInstructor() && hasCourseAllowed && hasCourseInstanceAllowed) {
>>>>>>> master
      await execute(sql.insert_lci, {
        lti13_instance_id: req.params.lti13_instance_id,
        deployment_id: ltiClaim.deployment_id,
        context_id: ltiClaim.context?.id,
        context_label: ltiClaim.context?.label,
        context_title: ltiClaim.context?.title,
        course_instance_id: course_instance.id,
      });

      res.redirect(`/pl/lti13_instance/${req.params.lti13_instance_id}/course_navigation?done`);
    } else {
      throw new HttpStatusError(403, 'Access denied');
    }
  }),
);

export default router;
