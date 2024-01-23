import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryOptionalRow, queryAsync, callRow } from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import type { Request } from 'express';
import { z } from 'zod';

import { CourseInstance, Lti13CourseInstanceSchema } from '../../../lib/db-types';
import { selectCoursesWithEditAccess } from '../../../models/course';
import { selectCourseInstancesWithStaffAccess } from '../../../models/course-instances';
import {
  Lti13CourseNavigationInstructor,
  Lti13CourseNavigationNotReady,
  Lti13CourseNavigationDone,
} from './lti13CourseNavigation.html';
import { Lti13Claim } from '../../lib/lti13';

const sql = loadSqlEquiv(__filename);
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

    const LTI = new Lti13Claim(req);
    const courseName = `${LTI.context?.label}: ${LTI.context?.title}`;
    let role_instructor = LTI.isRoleInstructor();

    // FIXME
    if ('student' in req.query) {
      role_instructor = false;
    }

    // Get lti13_course_instance info, if present
    const lci = await queryOptionalRow(
      sql.get_course_instance,
      {
        lti13_instance_id: req.params.lti13_instance_id,
        deployment_id: LTI.deployment_id,
        context_id: LTI.context?.id,
      },
      Lti13CourseInstanceSchema,
    );

    if (lci && !('noredir' in req.query)) {
      if (role_instructor) {
        // Update lti13_course_instance on instructor login, helpful as LMS updates or we add features
        await queryAsync(sql.upsert_lci, {
          lti13_instance_id: req.params.lti13_instance_id,
          course_instance_id: lci.course_instance_id,
          deployment_id: LTI.deployment_id,
          context_id: LTI.context?.id,
          context_label: LTI.context?.label,
          context_title: LTI.context?.title,
        });

        // TODO: Set course/instance staff permissions for LMS course staff here?
      }

      // LTI claims not used after this page so remove them from the session
      LTI.remove();

      // Redirect to linked course instance
      res.redirect(
        `/pl/course_instance/${lci.course_instance_id}/${role_instructor ? 'instructor/' : ''}`,
      );
      return;
    }

    if (!role_instructor) {
      // Students get a "come back later" message
      res.send(
        Lti13CourseNavigationNotReady({
          resLocals: res.locals,
          courseName,
        }),
      );
      return;
    }

    // Instructor so lookup their existing information in PL

    let courses = await selectCoursesWithEditAccess({
      user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.authn_is_administrator,
    });

    // FIXME
    if ('nocourse' in req.query) {
      courses = [];
    }

    let course_instances: CourseInstance[] = [];

    // This should match our policy for who can link courses (only instructors? TAs?)
    for (const course of courses) {
      const loopCI = await selectCourseInstancesWithStaffAccess({
        course_id: course.id,
        user_id: res.locals.authn_user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        is_administrator: res.locals.authn_is_administrator,
        authn_is_administrator: res.locals.authn_is_administrator,
      });

      course_instances = [...course_instances, ...loopCI];
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

    const LTI = new Lti13Claim(req);
    const authn_lti13_instance_id = req.session.authn_lti13_instance_id;

    // Validate user login matches this lti13_instance
    if (unsafe_lti13_instance_id !== authn_lti13_instance_id) {
      throw error.make(403, 'Permission denied');
    }

    // Mapping of lti13_instance to institution to course instance?

    const ci_role_instructor = await callRow(
      'users_is_instructor_in_course_instance',
      [res.locals.authn_user.user_id, unsafe_course_instance_id],
      z.boolean(),
    );

    if (!LTI.isRoleInstructor() || !ci_role_instructor) {
      throw error.make(403, 'Permission denied');
    }

    await queryAsync(sql.insert_lci, {
      lti13_instance_id: req.params.lti13_instance_id,
      deployment_id: LTI.deployment_id,
      context_id: LTI.context?.id,
      context_label: LTI.context?.label,
      context_title: LTI.context?.title,
      course_instance_id: unsafe_course_instance_id,
    });

    res.redirect(`/pl/lti13_instance/${unsafe_lti13_instance_id}/course_navigation?done`);
  }),
);

export default router;
