import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow, queryAsync } from '@prairielearn/postgres';

import { IdSchema, Lti13CourseInstanceSchema } from '../../../lib/db-types.js';
import {
  selectCourseInstanceById,
  selectCourseInstancesWithStaffAccess,
  type CourseInstanceAuthz,
} from '../../../models/course-instances.js';
import { selectCoursesWithEditAccess } from '../../../models/course.js';
import { Lti13Claim } from '../../lib/lti13.js';

import {
  Lti13CourseNavigationInstructor,
  Lti13CourseNavigationNotReady,
  Lti13CourseNavigationDone,
} from './lti13CourseNavigation.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

function prettyCourseName(ltiClaim) {
  const context = ltiClaim.context;

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
        await queryAsync(sql.update_lti13_course_instance, {
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
        }),
      );
      return;
    }

    // Instructor so lookup their existing information in PL
    const courses = await selectCoursesWithEditAccess({
      user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.authn_is_administrator,
    });

    const course_instances: CourseInstanceAuthz[] = [];

    // TODO: Refactor to only list courses and pull in course instances in
    // the page via htmx
    //
    // This query is expensive for anyone connected to a large number of courses,
    // such as admins. Our expectation is that admins don't typically initialize
    // LTI flows so it will happen infrequently and Postgres will be fast enough
    // when this N+1 query runs.
    for (const course of courses) {
      // Only course owners can link
      if (!course.permissions_course.has_course_permission_own) {
        continue;
      }

      const instances = await selectCourseInstancesWithStaffAccess({
        course_id: course.id,
        user_id: res.locals.authn_user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        is_administrator: res.locals.authn_is_administrator,
        authn_is_administrator: res.locals.authn_is_administrator,
      });

      course_instances.push(...instances);
    }

    res.send(
      Lti13CourseNavigationInstructor({
        resLocals: res.locals,
        courseName,
        courses,
        course_instances,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const unsafe_course_instance_id = req.body.unsafe_course_instance_id;

    const ltiClaim = new Lti13Claim(req);
    const authn_lti13_instance_id = req.session.authn_lti13_instance_id;

    // Map passed and auth lti13_instance_id through institution to course instance, or fail
    const authorized = await queryOptionalRow(
      sql.select_lti13_course_instance_institution,
      {
        course_instance_id: unsafe_course_instance_id,
        lti13_instance_id: req.params.lti13_instance_id,
        authn_lti13_instance_id,
      },
      IdSchema,
    );

    if (authorized == null) {
      throw new HttpStatusError(403, 'Access denied');
    }

    // Check that user is course Owner for this course instance
    const course_instance = await selectCourseInstanceById(unsafe_course_instance_id);
    const courses = await selectCoursesWithEditAccess({
      user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.authn_is_administrator,
    });

    const is_ci_owner = courses.find(
      (course) =>
        course.id === course_instance?.course_id &&
        course.permissions_course.has_course_permission_own,
    );

    if (ltiClaim.isRoleInstructor() && is_ci_owner) {
      await queryAsync(sql.insert_lci, {
        lti13_instance_id: req.params.lti13_instance_id,
        deployment_id: ltiClaim.deployment_id,
        context_id: ltiClaim.context?.id,
        context_label: ltiClaim.context?.label,
        context_title: ltiClaim.context?.title,
        course_instance_id: unsafe_course_instance_id,
      });

      res.redirect(`/pl/lti13_instance/${req.params.lti13_instance_id}/course_navigation?done`);
    } else {
      throw new HttpStatusError(403, 'Access denied');
    }
  }),
);

export default router;
