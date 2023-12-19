import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryOptionalRow, queryAsync } from '@prairielearn/postgres';

import {
  CourseInstance,
  Lti13CourseInstanceSchema,
} from '../../../lib/db-types';
import { selectCoursesWithEditAccess } from '../../../models/course';
import { selectCourseInstancesWithStaffAccess } from '../../../models/course-instances';

import {
  Lti13CourseNavigationInstructor,
  Lti13CourseNavigationNotReady,
  Lti13CourseNavigationDone,
} from './lti13CourseNavigation.html';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

const lti13_claims = {
  'https://purl.imsglobal.org/spec/lti/claim/roles': [
    'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
    'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
    'http://purl.imsglobal.org/vocab/lis/v2/system/person#User',
  ],
  'https://purl.imsglobal.org/spec/lti/claim/context': {
    id: 'c9d7d100bb177c0e54f578e7ac538cd9f7a3e4ad',
    type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering'],
    label: 'POT 1',
    title: 'Potions',
  },
  'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
    '1:b82229c6e10bcb87beb1f1b287faee560ddc3109',
  'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
    id: 'c9d7d100bb177c0e54f578e7ac538cd9f7a3e4ad',
    title: 'Potions',
    description: null,
  },
  'https://purl.imsglobal.org/spec/lti/claim/tool_platform': {
    guid: 'JBDFobrLcVnRDhQtha6AxTviEE50NLpNfcwUPUu7:canvas-lms',
    name: 'Hogwarts',
    version: 'cloud',
    product_family_code: 'canvas',
  },
};

// Placeholder to be enlarged later
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

    // Get role of LTI user
    const roles = lti13_claims['https://purl.imsglobal.org/spec/lti/claim/roles'] ?? [];
    let role_instructor = roles.some((val) => val.endsWith('#Instructor'));

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

    //const lci: Lti13CourseInstance = { course_instance_id: '17', };

    if (lci && !('noredir' in req.query)) {
      // Update lti13_course_instance on instructor login, helpful as LMS updates or we add features
      if (role_instructor) {
        await queryAsync(sql.upsert_lci, {
          lti13_instance_id: req.params.lti13_instance_id,
          deployment_id: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
          context_id: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].id,
          context_label: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].label,
          context_title: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].title,
        });
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
    // todo: make sure saving user has the right permissions
    // is instructor
    // has course instance permission
    // existing LTI13 instance information lines up

    // Insert
    await queryAsync(sql.insert_lci, {
      lti13_instance_id: req.params.lti13_instance_id,
      deployment_id: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
      context_id: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].id,
      context_label: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].label,
      context_title: lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'].title,
      course_instance_id: req.body.ci_id,
    });

    res.redirect(`/pl/lti13_instance/${req.params.lti13_instance_id}/course_navigation?done`);
  }),
);

export default router;
