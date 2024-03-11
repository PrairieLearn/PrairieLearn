// @ts-check
import * as express from 'express';
const asyncHandler = require('express-async-handler');
import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import { getEnrollmentForUserInCourseInstance } from '../../models/enrollment';
import { selectUserByUid } from '../../models/user';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

async function getUserIdAndCheckEnrollment({ uid, course_instance_id }) {
  const user = await selectUserByUid(uid);
  if (!user) {
    throw error.make(400, `User ${uid} does not exist.`);
  }

  const enrollment = await getEnrollmentForUserInCourseInstance({
    user_id: user.user_id,
    course_instance_id: course_instance_id,
  });
  if (!enrollment) {
    throw error.make(400, `User ${uid} is not enrolled in this course instance.`);
  }

  return user.user_id;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    console.log(res.locals.authz_data);
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw error.make(403, 'Access denied (must be a student data editor)');
    }
    const result = await sqldb.queryAsync(sql.select_assessment_access_policies, {
      assessment_id: res.locals.assessment.id,
    });
    res.locals.policies = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw error.make(403, 'Access denied (must be a student data editor)');
    }
    if (req.body.__action === 'add_new_override') {
      let user_id = null;
      if (req.body.student_uid) {
        user_id = await getUserIdAndCheckEnrollment({
          uid: req.body.student_uid,
          course_instance_id: res.locals.course_instance.id,
        });
      }
      const params = {
        assessment_id: res.locals.assessment.id,
        created_by: res.locals.authn_user.user_id,
        credit: req.body.credit,
        end_date: new Date(req.body.end_date),
        group_name: req.body.group_name || null,
        note: req.body.note || null,
        start_date: new Date(req.body.start_date),
        group_id: null,
        user_id: user_id || null,
      };
      // First, validate if group belongs to the assessment
      if (res.locals.assessment.group_work) {
        if (!params.group_name || params.user_id) {
          throw error.make(400, 'Group name is required for group work assessments.');
        }
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
      } else {
        if (!params.user_id || params.group_name) {
          throw error.make(400, 'Student User ID is required for individual work assessments.');
        }
      }
      await sqldb.queryAsync(sql.insert_assessment_access_policy, params);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_override') {
      await sqldb.queryAsync(sql.delete_assessment_access_policy, {
        assessment_id: res.locals.assessment.id,
        unsafe_assessment_access_policies_id: req.body.policy_id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_override') {
      let user_id = null;
      if (req.body.student_uid) {
        user_id = await getUserIdAndCheckEnrollment({
          uid: req.body.student_uid,
          course_instance_id: res.locals.course_instance.id,
        });
      }

      const edit_params = {
        assessment_id: res.locals.assessment.id,
        credit: req.body.credit,
        end_date: new Date(req.body.end_date),
        group_name: req.body.group_name || null,
        note: req.body.note || null,
        start_date: new Date(req.body.start_date),
        group_id: null,
        user_id: user_id || null,
        assessment_access_policies_id: req.body.policy_id,
      };

      // Validate if group belongs to the assessment, otherwise check if student is enrolled in assessment
      if (res.locals.assessment.group_work) {
        if (!edit_params.group_name || edit_params.user_id) {
          throw error.make(400, 'Group name is required for group work assessments.');
        }
        const group_result = await sqldb.queryAsync(sql.select_group_in_assessment, {
          group_name: edit_params.group_name,
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
      } else {
        if (!edit_params.user_id || edit_params.group_name) {
          throw error.make(400, 'Student UID is required for individual work assessments.');
        }
      }
      await sqldb.queryAsync(sql.update_assessment_access_policy, edit_params);
      res.redirect(req.originalUrl);
    }
  }),
);

export default router;
