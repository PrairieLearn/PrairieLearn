import { Temporal } from '@js-temporal/polyfill';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  checkBelongs,
  deleteAllAssessmentInstancesForAssessment,
  deleteAssessmentInstance,
  gradeAllAssessmentInstances,
  gradeAssessmentInstance,
} from '../../lib/assessment.js';
import { regradeAssessmentInstance } from '../../lib/regrading.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import { InstructorAssessmentInstances } from './instructorAssessmentInstances.html.js';
import { AssessmentInstanceRowSchema } from './instructorAssessmentInstances.types.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/raw_data.json',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const assessmentInstances = await sqldb.queryRows(
      sql.select_assessment_instances,
      { assessment_id: res.locals.assessment.id },
      AssessmentInstanceRowSchema,
    );
    res.send(assessmentInstances);
  }),
);

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  asyncHandler(async (req, res) => {
    res.send(InstructorAssessmentInstances({ resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'close') {
      const assessment_id = res.locals.assessment.id;
      const assessment_instance_id = req.body.assessment_instance_id;
      await checkBelongs(assessment_instance_id, assessment_id);
      await gradeAssessmentInstance({
        assessment_instance_id,
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        requireOpen: true,
        close: true,
        ignoreGradeRateLimit: true,
        ignoreRealTimeGradingDisabled: true,
        client_fingerprint_id: null,
      });
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
      const job_sequence_id = await gradeAllAssessmentInstances({
        assessment_id,
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        close: req.body.__action === 'close_all',
        ignoreGradeRateLimit: true,
        ignoreRealTimeGradingDisabled: true,
      });
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
      await checkBelongs(assessment_instance_id, assessment_id);
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
        base_time: 'date_limit',
        authn_user_id: res.locals.authz_data.authn_user.user_id,
        exact_date: new Date(),
      };
      if (req.body.action === 'remove' || req.body.reopen_without_limit === 'true') {
        params.base_time = 'null';
      } else if (req.body.action === 'expire') {
        params.base_time = 'current_date';
        params.time_add = 0;
      } else if (req.body.action === 'set_total') {
        params.base_time = 'start_date';
      } else if (req.body.action === 'set_rem') {
        params.base_time = 'current_date';
      } else if (req.body.action === 'set_exact') {
        params.base_time = 'exact_date';
        params.time_add = 0;
        params.exact_date = new Date(
          Temporal.PlainDateTime.from(req.body.date).toZonedDateTime(
            res.locals.course_instance.display_timezone,
          ).epochMilliseconds,
        );
      } else if (req.body.action === 'subtract') {
        params.time_add *= -1;
      }
      await sqldb.execute(sql.set_time_limit, params);
      res.send(JSON.stringify({}));
    } else if (req.body.__action === 'set_time_limit_all') {
      const params = {
        assessment_id: res.locals.assessment.id,
        time_add: req.body.time_add,
        base_time: 'date_limit',
        reopen_closed: !!req.body.reopen_closed,
        authn_user_id: res.locals.authz_data.authn_user.user_id,
        exact_date: new Date(),
      };
      if (req.body.action === 'remove') {
        params.base_time = 'null';
      } else if (req.body.action === 'expire') {
        params.base_time = 'current_date';
        params.time_add = 0;
      } else if (req.body.action === 'set_total') {
        params.base_time = 'start_date';
      } else if (req.body.action === 'set_rem') {
        params.base_time = 'current_date';
      } else if (req.body.action === 'set_exact') {
        params.base_time = 'exact_date';
        params.time_add = 0;
        params.exact_date = new Date(
          Temporal.PlainDateTime.from(req.body.date).toZonedDateTime(
            res.locals.course_instance.display_timezone,
          ).epochMilliseconds,
        );
      } else if (req.body.action === 'subtract') {
        params.time_add *= -1;
      }
      await sqldb.execute(sql.set_time_limit_all, params);
      res.send(JSON.stringify({}));
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
