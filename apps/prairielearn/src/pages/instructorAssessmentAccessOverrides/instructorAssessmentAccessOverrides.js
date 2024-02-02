// @ts-check
import * as express from 'express';
const asyncHandler = require('express-async-handler');
import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import { getEnrollmentForUserInCourseInstance } from '../../models/enrollment';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryAsync(sql.select_assessment_access_policies, {
      assessment_id: res.locals.assessment.id,
      student_uid: req.body.student_uid,
    });
    res.locals.policies = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_new_override') {
      const params = {
        assessment_id: res.locals.assessment.id,
        created_by: res.locals.authn_user.user_id,
        credit: req.body.credit,
        end_date: new Date(req.body.end_date),
        group_name: req.body.group_name || null,
        note: req.body.note || null,
        start_date: new Date(req.body.start_date),
        student_uid: req.body.student_uid,
      };
      // First, validate if group belongs to the assessment
      if (params.group_name) {
        const group_result = await sqldb.queryZeroOrOneRowAsync(sql.select_group_in_assessment, {
          group_name: params.group_name,
          course_instance_id: res.locals.course_instance.id,
          assessment_id: res.locals.assessment.id,
        });
        // Get the group_id from the result
        if (group_result.rows.length > 0) {
          params.group_id = group_result.rows[0].id;
        } else {
          params.group_id = null;
        }

        // If group does not belong to assessments and indirectly course instances, return error
        if (!params.group_id) {
          throw error.make(400, 'Group not found in this assessment.');
        }
      }
      await sqldb.queryAsync(sql.insert_assessment_access_policy, params);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_override') {
      await sqldb.queryAsync(sql.delete_assessment_access_policy, {
        unsafe_assessment_access_policies_id: req.body.unsafe_assessment_access_policies_id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_override') {
      const edit_params = {
        assessment_id: res.locals.assessment.id,
        credit: req.body.credit,
        end_date: new Date(req.body.end_date),
        group_name: req.body.group_name || null,
        note: req.body.note || null,
        start_date: new Date(req.body.start_date),
        student_uid: req.body.student_uid,
      };
      const enrollment = await getEnrollmentForUserInCourseInstance({
        user_id: edit_params.student_uid,
        course_instance_id: res.locals.course_instance.id,
      });
      if (!enrollment) {
        throw error.make(400, 'Student is not enrolled in the current course instance.');
      }
      // Validate if group belongs to the assessment
      if (edit_params.group_name) {
        const group_result = await sqldb.queryAsync(sql.select_group_in_assessment, {
          group_id: edit_params.group_id,
          course_instance_id: res.locals.course_instance.id,
          assessment_id: res.locals.assessment.id,
        });
        // Get the group_id from the result
        if (group_result.rows.length > 0) {
          edit_params.group_id = group_result.rows[0].id;
        } else {
          edit_params.group_id = null;
        }

        // If group does not belong to assessments and indirectly course instances, return error
        if (!edit_params.group_id) {
          throw error.make(400, 'Group does not belong to the current course instance.');
        }
      }
      await sqldb.queryAsync(sql.update_assessment_access_policy, edit_params);
      res.redirect(req.originalUrl);
    }
  }),
);

module.exports = router;
