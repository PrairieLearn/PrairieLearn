import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { Lti13CourseInstanceSchema } from '../../../lib/db-types';

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
};

// Placeholder to be enlarged later
router.get(
  '/',
  asyncHandler(async (req, res) => {
    console.log(`course nav for ${req.params.lti13_instance_id}`);

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

    if (lci) {
      console.log(lci);
      // Redirect from sourced info
      // return
    }

    // Get role of LTI user
    const roles = lti13_claims['https://purl.imsglobal.org/spec/lti/claim/roles'] ?? [];
    const role_instructor = roles.some((val) => val.endsWith('#Instructor'));

    console.log(role_instructor);
    // Instructors get options
    // Non-instructors get an explanation

    res.redirect('/pl');
  }),
);

/* On saving course_instance_id connection, make sure the user has the right permissions */

export default router;
