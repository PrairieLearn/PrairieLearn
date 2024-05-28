import * as express from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { runInTransactionAsync } from '@prairielearn/postgres';

import { Assessment, AssessmentAccessPolicySchema, IdSchema } from '../../lib/db-types.js';
import { insertAuditLog } from '../../models/audit-log.js';
import { getEnrollmentForUserInCourseInstance } from '../../models/enrollment.js';
import { selectUserByUid } from '../../models/user.js';

import {
  AssessmentAccessPolicyRowSchema,
  InstructorAssessmentAccessOverrides,
} from './instructorAssessmentAccessOverrides.html.js';

const router = express.Router();

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function getUserOrGroupId({
  course_instance_id,
  assessment,
  uid,
  group_name,
}: {
  course_instance_id: string;
  assessment: Assessment;
  uid: string | null;
  group_name: string | null;
}) {
  if (assessment.group_work) {
    if (!group_name || uid) {
      throw new HttpStatusError(400, 'Group name is required for group work assessments.');
    }

    const group_id = await sqldb.queryOptionalRow(
      sql.select_group_in_assessment,
      {
        group_name,
        course_instance_id,
        assessment_id: assessment.id,
      },
      IdSchema,
    );

    if (group_id == null) {
      throw new HttpStatusError(400, 'Group not found in this assessment.');
    }

    return { user_id: null, group_id };
  }
  if (uid) {
    if (group_name) {
      throw new HttpStatusError(400, 'Student UID is required for individual work assessments.');
    }

    const user = await selectUserEnrolledInCourseInstance({
      uid,
      course_instance_id,
    });

    if (!user) {
      throw new HttpStatusError(400, `User ${uid} is not enrolled in this course instance.`);
    }

    return { user_id: user.user_id, group_id: null };
  } else {
    throw new HttpStatusError(400, 'Student UID or Group Name is required.');
  }
}

async function selectUserEnrolledInCourseInstance({
  uid,
  course_instance_id,
}: {
  uid: string;
  course_instance_id: string;
}) {
  const user = await selectUserByUid(uid);
  if (!user) return null;

  const enrollment = await getEnrollmentForUserInCourseInstance({
    user_id: user.user_id,
    course_instance_id,
  });
  if (!enrollment) return null;

  return user;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    if (!res.locals.assessment_access_overrides_enabled) {
      throw new HttpStatusError(403, 'Access denied (feature not available)');
    }

    const policies = await sqldb.queryRows(
      sql.select_assessment_access_policies,
      {
        assessment_id: res.locals.assessment.id,
        timezone: res.locals.course_instance.display_timezone,
      },
      AssessmentAccessPolicyRowSchema,
    );

    res.send(
      InstructorAssessmentAccessOverrides({
        policies,
        timezone: res.locals.course_instance.display_timezone,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    if (!res.locals.assessment_access_overrides_enabled) {
      throw new HttpStatusError(403, 'Access denied (feature not available)');
    }

    if (req.body.__action === 'add_new_override') {
      await runInTransactionAsync(async () => {
        const { user_id, group_id } = await getUserOrGroupId({
          course_instance_id: res.locals.course_instance.id,
          assessment: res.locals.assessment,
          uid: req.body.student_uid,
          group_name: req.body.group_name,
        });
        const inserted = await sqldb.queryRow(
          sql.insert_assessment_access_policy,
          {
            assessment_id: res.locals.assessment.id,
            created_by: res.locals.authn_user.user_id,
            credit: req.body.credit,
            end_date: req.body.end_date,
            note: req.body.note || null,
            start_date: req.body.start_date,
            group_id: group_id || null,
            user_id: user_id || null,
            timezone: res.locals.course_instance.display_timezone,
          },
          AssessmentAccessPolicySchema,
        );
        await insertAuditLog({
          authn_user_id: res.locals.authn_user.user_id,
          table_name: 'assessment_access_policies',
          action: 'insert',
          institution_id: res.locals.institution.id,
          course_id: res.locals.course.id,
          course_instance_id: res.locals.course_instance.id,
          new_state: JSON.stringify(inserted),
          row_id: inserted.id,
        });
      });

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_override') {
      const { user_id, group_id } = await getUserOrGroupId({
        course_instance_id: res.locals.course_instance.id,
        assessment: res.locals.assessment,
        uid: req.body.student_uid,
        group_name: req.body.group_name,
      });

      await runInTransactionAsync(async () => {
        const oldStateAccessPolicy = await sqldb.queryRow(
          sql.select_assessment_access_policy,
          {
            policy_id: req.body.policy_id,
          },
          AssessmentAccessPolicySchema,
        );
        const editAccessPolicy = await sqldb.queryOptionalRow(
          sql.update_assessment_access_policy,
          {
            assessment_id: res.locals.assessment.id,
            credit: req.body.credit,
            end_date: req.body.end_date,
            note: req.body.note || null,
            start_date: req.body.start_date,
            group_id: group_id || null,
            user_id: user_id || null,
            assessment_access_policies_id: req.body.policy_id,
            timezone: res.locals.course_instance.display_timezone,
          },
          AssessmentAccessPolicySchema,
        );
        if (editAccessPolicy) {
          await insertAuditLog({
            authn_user_id: res.locals.authn_user.user_id,
            table_name: 'assessment_access_policies',
            action: 'update',
            institution_id: res.locals.institution.id,
            course_id: res.locals.course.id,
            course_instance_id: res.locals.course_instance.id,
            new_state: JSON.stringify(editAccessPolicy),
            old_state: JSON.stringify(oldStateAccessPolicy),
            row_id: editAccessPolicy.id,
          });
        }
      });

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_override') {
      await runInTransactionAsync(async () => {
        const deletedAccessPolicy = await sqldb.queryOptionalRow(
          sql.delete_assessment_access_policy,
          {
            assessment_id: res.locals.assessment.id,
            unsafe_assessment_access_policies_id: req.body.policy_id,
          },
          AssessmentAccessPolicySchema,
        );
        if (deletedAccessPolicy) {
          await insertAuditLog({
            authn_user_id: res.locals.authn_user.user_id,
            table_name: 'assessment_access_policies',
            action: 'delete',
            institution_id: res.locals.institution.id,
            course_id: res.locals.course.id,
            course_instance_id: res.locals.course_instance.id,
            old_state: JSON.stringify(deletedAccessPolicy),
            row_id: deletedAccessPolicy.id,
          });
        }
      });

      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
