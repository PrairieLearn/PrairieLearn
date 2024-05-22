import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryOptionalRow,
  queryAsync,
  queryOneRowAsync,
} from '@prairielearn/postgres';

import { Lti13CourseInstanceSchema } from '../../../lib/db-types.js';
import {
  selectCourseInstanceById,
  selectCourseInstancesWithStaffAccess,
  CourseInstanceAuthz,
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
    const courseName = `${ltiClaim.context?.label}: ${ltiClaim.context?.title}`;
    const role_instructor = ltiClaim.isRoleInstructor();

    // Get lti13_course_instance info, if present
    const lti13_course_instance = await queryOptionalRow(
      sql.select_course_instance,
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
    const unsafe_course_instance_id = req.body.ci_id;
    const unsafe_lti13_instance_id = req.params.lti13_instance_id;

    const ltiClaim = new Lti13Claim(req);
    const authn_lti13_instance_id = req.session.authn_lti13_instance_id;

    // Validate user login matches this lti13_instance
    if (unsafe_lti13_instance_id !== authn_lti13_instance_id) {
      throw error.make(403, 'Permission denied');
    }

    // Map lti13_instance through institution to course instance or fail
    await queryOneRowAsync(sql.select_lti_course_instance_institution, {
      course_instance_id: req.body.ci_id,
      lti13_instance_id: req.params.lti13_instance_id,
    });

    // Check that user is course Owner for this CI
    const ci = await selectCourseInstanceById(req.body.ci_id);
    const courses = await selectCoursesWithEditAccess({
      user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.authn_is_administrator,
    });

    const is_ci_owner = courses.find(
      (course) =>
        course.id === ci?.course_id && course.permissions_course.has_course_permission_own,
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

      res.redirect(`/pl/lti13_instance/${unsafe_lti13_instance_id}/course_navigation?done`);
    } else {
      throw error.make(403, 'Permission denied');
    }
  }),
);

export default router;
