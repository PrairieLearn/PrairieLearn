// @ts-check
import * as express from 'express';
const asyncHandler = require('express-async-handler');
import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import { getEnrollmentForUserInCourseInstance } from '../../models/enrollment';
import { selectUserByUid } from '../../models/user';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

async function userIsEnrolledInCourseInstance({ uid, course_instance_id }) {
  const user = await selectUserByUid(uid);
  if (!user) return false;

  const enrollment = await getEnrollmentForUserInCourseInstance({
    user_id: user.user_id,
    course_instance_id: course_instance_id,
  });
  return !!enrollment;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryAsync(sql.select_assessment_access_policies, {
      assessment_id: res.locals.assessment.id,
      student_uid: req.body.student_uid,
      course_instance_id: res.locals.course ? res.locals.course_instance.id : null,
      course_id: res.locals.course ? res.locals.course.id : null
    });
    res.locals.policies = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    
    if (req.body.__action === 'add_new_override') {
      const isEnrolled = await userIsEnrolledInCourseInstance({
        uid: req.body.student_uid,
        course_instance_id: res.locals.course_instance.id,
      });
      if (!isEnrolled) {
        throw error.make(400, `User ${req.body.student_uid} is not enrolled in this course instance.`);
      }
      const user = await selectUserByUid(req.body.student_uid);
      const params = {
        assessment_id: res.locals.assessment.id,
        created_by: res.locals.authn_user.user_id,
        credit: req.body.credit,
        end_date: new Date(req.body.end_date),
        group_name: req.body.group_name || null,
        note: req.body.note || null,
        start_date: new Date(req.body.start_date),
        group_id: null,
        user_id: user?.user_id || null,
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
        
       
        const isEnrolled = await userIsEnrolledInCourseInstance({
          uid: req.body.student_uid,
          course_instance_id: res.locals.course_instance.id,
        });
        if (!isEnrolled) {
          throw error.make(400, `User ${req.body.student_uid} is not enrolled in this course instance.`);
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
      const isEnrolled = await userIsEnrolledInCourseInstance({
        uid: req.body.student_uid,
        course_instance_id: res.locals.course_instance.id,
      });
      if (!isEnrolled) {
        throw error.make(400, `User ${req.body.student_uid} is not enrolled in this course instance.`);
      }
      const user = await selectUserByUid(req.body.student_uid);
      const edit_params = {
        assessment_id: res.locals.assessment.id,
        credit: req.body.credit,
        end_date: new Date(req.body.end_date),
        group_name: req.body.group_name || null,
        note: req.body.note || null,
        start_date: new Date(req.body.start_date),
        group_id: null,
        user_id: user?.user_id || null,
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
        
        const isEnrolled = await userIsEnrolledInCourseInstance({
          uid: req.body.student_uid,
          course_instance_id: res.locals.course_instance.id,
        });
        if (!isEnrolled) {
          throw error.make(400, `User ${req.body.student_uid} is not enrolled in this course instance.`);
        }
      }
      await sqldb.queryAsync(sql.update_assessment_access_policy, edit_params);
      res.redirect(req.originalUrl);
    }
  }),
);

export default router;
