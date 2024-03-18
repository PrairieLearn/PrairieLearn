// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { regradeAssessmentInstance } from '../../lib/regrading';
import {
  checkBelongsAsync,
  gradeAssessmentInstance,
  gradeAllAssessmentInstances,
  deleteAllAssessmentInstancesForAssessment,
  deleteAssessmentInstance,
} from '../../lib/assessment';
import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '../../lib/db-types';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const AssessmentInstanceRowSchema = z.object({
  assessment_label: z.string(),
  user_id: IdSchema.nullable(),
  uid: z.string().nullable(),
  name: z.string().nullable(),
  role: z.string().nullable(),
  group_id: IdSchema.nullable(),
  group_name: z.string().nullable(),
  uid_list: z.array(z.string()).nullable(),
  user_name_list: z.array(z.string()).nullable(),
  group_roles: z.array(z.string()).nullable(),
  username: z.string().nullable(),
  score_perc: z.number().nullable(),
  points: z.number(),
  max_points: z.number(),
  number: z.number(),
  assessment_instance_id: IdSchema,
  open: z.boolean(),
  time_remaining: z.string(),
  time_remaining_sec: z.number().nullable(),
  total_time: z.string(),
  total_time_sec: z.number().nullable(),
  date: z.date(),
  date_formatted: z.string(),
  duration: z.string(),
  duration_secs: z.number(),
  duration_mins: z.number(),
  highest_score: z.boolean(),
  client_fingerprint_id_change_count: z.number(),
});

router.get(
  '/raw_data.json',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    const assessmentInstances = await sqldb.queryRows(
      sql.select_assessment_instances,
      {
        assessment_id: res.locals.assessment.id,
        group_work: res.locals.assessment.group_work,
      },
      AssessmentInstanceRowSchema,
    );
    res.send(assessmentInstances);
  }),
);

router.get(
  '/client.js',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    res.type('text/javascript');
    res.render(__filename.replace(/\.js$/, 'ClientJS.ejs'), res.locals);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw error.make(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'close') {
      const assessment_id = res.locals.assessment.id;
      const assessment_instance_id = req.body.assessment_instance_id;
      await checkBelongsAsync(assessment_instance_id, assessment_id);
      const requireOpen = true;
      const close = true;
      const overrideGradeRate = true;
      await gradeAssessmentInstance(
        assessment_instance_id,
        res.locals.authn_user.user_id,
        requireOpen,
        close,
        overrideGradeRate,
        null, // client_fingerprint_id
      );
      res.send(JSON.stringify({}));
    } else if (req.body.__action === 'delete') {
      const assessment_id = res.locals.assessment.id;
      const assessment_instance_id = req.body.assessment_instance_id;
      await deleteAssessmentInstance(
        assessment_id,
        assessment_instance_id,
        res.locals.authn_user.user_id,
      );
      res.send(JSON.stringify({}));
    } else if (req.body.__action === 'grade_all' || req.body.__action === 'close_all') {
      const assessment_id = res.locals.assessment.id;
      const close = req.body.__action === 'close_all';
      const overrideGradeRate = true;
      const job_sequence_id = await gradeAllAssessmentInstances(
        assessment_id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
        close,
        overrideGradeRate,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'delete_all') {
      await deleteAllAssessmentInstancesForAssessment(
        res.locals.assessment.id,
        res.locals.authn_user.user_id,
      );
      res.send(JSON.stringify({}));
    } else if (req.body.__action === 'regrade') {
      const assessment_id = res.locals.assessment.id;
      const assessment_instance_id = req.body.assessment_instance_id;
      await checkBelongsAsync(assessment_instance_id, assessment_id);
      const job_sequence_id = await regradeAssessmentInstance(
        assessment_instance_id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'set_time_limit') {
      const params = {
        assessment_instance_id: req.body.assessment_instance_id,
        assessment_id: res.locals.assessment.id,
        time_add: req.body.time_add,
        time_ref: req.body.time_ref,
        base_time: 'date_limit',
        authn_user_id: res.locals.authz_data.authn_user.user_id,
      };
      if (req.body.plus_minus === 'unlimited') {
        params.base_time = 'null';
      } else if (req.body.plus_minus === 'expire') {
        params.base_time = 'current_date';
        params.time_add = 0;
        params.time_ref = 'minutes';
      } else if (req.body.plus_minus === 'set_total') {
        params.base_time = 'start_date';
      } else if (req.body.plus_minus === 'set_rem') {
        params.base_time = 'current_date';
      } else {
        params.time_add *= req.body.plus_minus;
      }
      await sqldb.queryAsync(sql.set_time_limit, params);
      res.send(JSON.stringify({}));
    } else if (req.body.__action === 'set_time_limit_all') {
      const params = {
        assessment_id: res.locals.assessment.id,
        time_add: req.body.time_add,
        time_ref: req.body.time_ref,
        base_time: 'date_limit',
        reopen_closed: !!req.body.reopen_closed,
        authn_user_id: res.locals.authz_data.authn_user.user_id,
      };
      if (req.body.plus_minus === 'unlimited') {
        params.base_time = 'null';
      } else if (req.body.plus_minus === 'expire') {
        params.base_time = 'current_date';
        params.time_add = 0;
        params.time_ref = 'minutes';
      } else if (req.body.plus_minus === 'set_total') {
        params.base_time = 'start_date';
      } else if (req.body.plus_minus === 'set_rem') {
        params.base_time = 'current_date';
      } else {
        params.time_add *= req.body.plus_minus;
      }
      await sqldb.queryAsync(sql.set_time_limit_all, params);
      res.send(JSON.stringify({}));
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
