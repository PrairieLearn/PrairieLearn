import asyncHandler = require('express-async-handler');
import express = require('express');
import error = require('@prairielearn/error');
import sqldb = require('@prairielearn/postgres');
import { z } from 'zod';

import {
  Enroll,
  EnrollLtiMessage,
  CourseInstanceSchema,
  EnrollmentLimitExceededMessage,
} from './enroll.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (res.locals.authn_provider_name === 'LTI') {
      const result = await sqldb.queryOneRowAsync(sql.lti_course_instance_lookup, {
        course_instance_id: res.locals.authn_user.lti_course_instance_id,
      });
      res.send(EnrollLtiMessage({ ltiInfo: result.rows[0], resLocals: res.locals }));
      return;
    }

    const courseInstances = await sqldb.queryRows(
      sql.select_course_instances,
      {
        user_id: res.locals.authn_user.user_id,
        req_date: res.locals.req_date,
      },
      CourseInstanceSchema
    );
    res.send(Enroll({ courseInstances, resLocals: res.locals }));
  })
);

router.get(
  '/limit_exceeded',
  asyncHandler((req, res) => {
    res.send(EnrollmentLimitExceededMessage({ resLocals: res.locals }));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (res.locals.authn_provider_name === 'LTI') {
      throw error.make(400, 'Enrollment unavailable, managed via LTI');
    }

    if (req.body.__action === 'enroll') {
      const enrollment = await sqldb.queryOptionalRow(
        sql.enroll,
        {
          course_instance_id: req.body.course_instance_id,
          user_id: res.locals.authn_user.user_id,
          req_date: res.locals.req_date,
        },
        z.object({
          enrollment_id: z.string(),
          course_instance_limit_exceeded: z.boolean(),
          institution_yearly_limit_exceeded: z.boolean(),
        })
      );

      if (!enrollment) {
        // If an enrollment wasn't returned, that currently means that we
        // exceeded an enrollment limit. We won't share any specific details
        // here. In the future, course staff will be able to check their
        // enrollment limits for themselves.
        res.redirect('/pl/enroll/limit_exceeded');
        return;
      }

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'unenroll') {
      await sqldb.queryOneRowAsync(sql.unenroll, {
        course_instance_id: req.body.course_instance_id,
        user_id: res.locals.authn_user.user_id,
        req_date: res.locals.req_date,
      });
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, 'unknown action: ' + res.locals.__action, {
        __action: req.body.__action,
        body: req.body,
      });
    }
  })
);

export default router;
