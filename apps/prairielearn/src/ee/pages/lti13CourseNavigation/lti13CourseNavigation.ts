import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryOptionalRow, queryAsync, callAsync } from '@prairielearn/postgres';

import { CourseInstance, Lti13CourseInstanceSchema } from '../../../lib/db-types';
import { selectCoursesWithEditAccess } from '../../../models/course';
import { selectCourseInstancesWithStaffAccess } from '../../../models/course-instances';
import {
  Lti13CourseNavigationInstructor,
  Lti13CourseNavigationNotReady,
  Lti13CourseNavigationDone,
} from './lti13CourseNavigation.html';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const lti13_claims = req.session.lti13_claims;

    if ('done' in req.query) {
      res.send(
        Lti13CourseNavigationDone({
          resLocals: res.locals,
          lti13_instance_id: req.params.lti13_instance_id,
        }),
      );
      return;
    }

    // TODO Validate LTI claim info or error

    /*

     TA roles

     [
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Student',
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
      'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant',
      'http://purl.imsglobal.org/vocab/lis/v2/system/person#User'
    ]
    */

    // TODO Move is_instructor logic to library, consider TA roles
    // Get role of LTI user
    const roles = lti13_claims['https://purl.imsglobal.org/spec/lti/claim/roles'] ?? [];
    // Scoped to just this context
    // https://www.imsglobal.org/spec/lti/v1p3#lis-vocabulary-for-context-roles
    let role_instructor = roles.some(
      (val: string) =>
        ['Instructor', 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'].includes(val)
    );

    console.log(roles, role_instructor);

    // FIXME
    if ('student' in req.query) {
      role_instructor = false;
    }

    // Get lti13_course_instance info, if present
    const lci = await queryOptionalRow(
      sql.get_course_instance,
      {
        lti13_instance_id: req.params.lti13_instance_id,
        deployment_id: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
        context_id: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].id,
      },
      Lti13CourseInstanceSchema,
    );

    if (lci && !('noredir' in req.query)) {
      if (role_instructor) {
        // Update lti13_course_instance on instructor login, helpful as LMS updates or we add features
        await queryAsync(sql.upsert_lci, {
          lti13_instance_id: req.params.lti13_instance_id,
          course_instance_id: lci.course_instance_id,
          deployment_id: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
          context_id: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].id,
          context_label: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].label,
          context_title: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].title,
        });

        // TODO: Set course/instance staff permissions on LMS course staff here?
      }

      // Redirect to linked course instance
      res.redirect(
        `/pl/course_instance/${lci.course_instance_id}/${role_instructor ? 'instructor/' : ''}`,
      );
      return;
    }

    let courseName = 'your course';
    if (
      'label' in lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'] &&
      'title' in lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context']
    ) {
      courseName = lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].label;
      courseName += `: ${lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].title}`;
    }

    if (!role_instructor) {
      // Students get a "come back later" message
      res.send(
        Lti13CourseNavigationNotReady({
          resLocals: res.locals,
          courseName,
        }),
      );
    } else {
      let courses = await selectCoursesWithEditAccess({
        user_id: res.locals.authn_user.user_id,
        is_administrator: res.locals.authn_is_administrator,
      });

      // FIXME
      if ('nocourse' in req.query) {
        courses = [];
      }

      let course_instances: CourseInstance[] = [];

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
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const unsafe_course_instance_id = req.body.ci_id;
    const unsafe_lti13_instance_id = req.params.lti13_instance_id;

    const lti13_claims = req.session.lti13_claims;
    const authn_lti13_instance_id = req.session.authn_lti13_instance_id;

    // Validate claims have fields we need. Zod?

    // Validate user login match this lti13_instance
    if (unsafe_lti13_instance_id !== authn_lti13_instance_id) {
      throw new Error(`Permission denied`);
    }

    // Check user has instructor permissions in LMS and CI
    // Mapping of lti13_instance to institution to course instance?
    // TODO use library call here
    const roles = lti13_claims['https://purl.imsglobal.org/spec/lti/claim/roles'] ?? [];
    const role_instructor = roles.some((val) => val.endsWith('#Instructor'));

    const is_ci_instructor = await callAsync('users_is_instructor_in_course_instance', [
      res.locals.authn_user.user_id,
      unsafe_course_instance_id,
    ]);

    if (!role_instructor || !is_ci_instructor.rows[0].is_instructor) {
      throw new Error(`Permission denied`);
    }

    await queryAsync(sql.insert_lci, {
      lti13_instance_id: req.params.lti13_instance_id,
      deployment_id: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
      context_id: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].id,
      context_label: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].label,
      context_title: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].title,
      course_instance_id: unsafe_course_instance_id,
    });

    res.redirect(`/pl/lti13_instance/${unsafe_lti13_instance_id}/course_navigation?done`);
  }),
);

export default router;
