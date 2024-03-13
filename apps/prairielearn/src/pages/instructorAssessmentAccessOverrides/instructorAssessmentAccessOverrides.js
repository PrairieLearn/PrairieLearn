// @ts-check
import * as express from 'express';
const asyncHandler = require('express-async-handler');
import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import { getEnrollmentForUserInCourseInstance } from '../../models/enrollment';
import { selectUserByUid } from '../../models/user';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

async function getUserOrGroupId({ course_instance_id, assessment, uid, group_name }) {
  if (assessment.group_work) {
    if (!group_name || uid) {
      throw error.make(400, 'Group name is required for group work assessments.');
    }
    const group_result = await sqldb.queryZeroOrOneRowAsync(sql.select_group_in_assessment, {
      group_name: group_name,
      course_instance_id: course_instance_id,
      assessment_id: assessment.id,
    });
    if (group_result.rows.length > 0) {
      return { user_id: null, group_id: group_result.rows[0].id };
    } else {
      throw error.make(400, 'Group not found in this assessment.');
    }
  }
  if (uid) {
    if (group_name) {
      throw error.make(400, 'Student User ID is required for individual work assessments.');
    }
    const user = await selectUserEnrolledInCourseInstance({
      uid: uid,
      course_instance_id: course_instance_id,
    });
    if (!user) {
      throw error.make(400, `User ${uid} is not enrolled in this course instance.`);
    }
    return { user_id: user.user_id, group_id: null };
  } else {
    throw error.make(400, 'Student User ID or Group Name is required.');
  }
}

async function selectUserEnrolledInCourseInstance({ uid, course_instance_id }) {
  const user = await selectUserByUid(uid);
  if (!user) return null;

  const enrollment = await getEnrollmentForUserInCourseInstance({
    user_id: user.user_id,
    course_instance_id: course_instance_id,
  });
  if (!enrollment) return null;
  return user;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
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
      const { user_id, group_id } = await getUserOrGroupId({
        course_instance_id: res.locals.course_instance.id,
        assessment: res.locals.assessment,
        uid: req.body.student_uid,
        group_name: req.body.group_name,
      });
      await sqldb.queryAsync(sql.insert_assessment_access_policy, {
        assessment_id: res.locals.assessment.id,
        created_by: res.locals.authn_user.user_id,
        credit: req.body.credit,
        end_date: new Date(req.body.end_date),
        group_name: req.body.group_name || null,
        note: req.body.note || null,
        start_date: new Date(req.body.start_date),
        group_id: group_id || null,
        user_id: user_id || null,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_override') {
      await sqldb.queryAsync(sql.delete_assessment_access_policy, {
        assessment_id: res.locals.assessment.id,
        unsafe_assessment_access_policies_id: req.body.policy_id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_override') {
      const { user_id, group_id } = await getUserOrGroupId({
        course_instance_id: res.locals.course_instance.id,
        assessment: res.locals.assessment,
        uid: req.body.student_uid,
        group_name: req.body.group_name,
      });
      await sqldb.queryAsync(sql.update_assessment_access_policy, {
        assessment_id: res.locals.assessment.id,
        credit: req.body.credit,
        end_date: new Date(req.body.end_date),
        group_name: req.body.group_name || null,
        note: req.body.note || null,
        start_date: new Date(req.body.start_date),
        group_id: group_id || null,
        user_id: user_id || null,
        assessment_access_policies_id: req.body.policy_id,
      });
      res.redirect(req.originalUrl);
    }
  }),
);

export default router;
