// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import * as assessment from '../../lib/assessment';
import {
  canUserAssignGroupRoles,
  getGroupConfig,
  getGroupInfo,
  getQuestionGroupPermissions,
  leaveGroup,
  updateGroupRoles,
} from '../../lib/groups';
import {
  AssessmentInstanceSchema,
  DateFromISOString,
  IdSchema,
  InstanceQuestionSchema,
} from '../../lib/db-types';
import { uploadFile, deleteFile } from '../../lib/file-store';
import { idsEqual } from '../../lib/id';

const router = express.Router();
const sql = loadSqlEquiv(__filename);

const InstanceQuestionRowSchema = InstanceQuestionSchema.extend({
  start_new_zone: z.boolean(),
  zone_id: IdSchema,
  zone_title: z.string().nullable(),
  question_title: z.string(),
  max_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
  max_auto_points: z.number().nullable(),
  init_points: z.number().nullable(),
  row_order: z.number(),
  question_number: z.string(),
  zone_max_points: z.number().nullable(),
  zone_has_max_points: z.boolean(),
  zone_best_questions: z.number().nullable(),
  zone_has_best_questions: z.boolean(),
  file_count: z.number(),
  sequence_locked: z.boolean(),
  prev_advance_score_perc: z.number().nullable(),
  prev_title: z.string().nullable(),
  prev_sequence_locked: z.boolean().nullable(),
  allow_grade_left_ms: z.coerce.number(),
  allow_grade_date: DateFromISOString.nullable(),
  allow_grade_interval: z.string(),
});

async function ensureUpToDate(locals) {
  const updated = await assessment.update(locals.assessment_instance.id, locals.authn_user.user_id);
  if (updated) {
    // we updated the assessment_instance, so reload it
    locals.assessment_instance = await queryRow(
      sql.select_assessment_instance,
      { assessment_instance_id: locals.assessment_instance.id },
      AssessmentInstanceSchema,
    );
  }
}

async function processFileUpload(req, res) {
  if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw new Error(`This assessment is not accepting submissions at this time.`);
  }
  await uploadFile({
    display_filename: req.file.originalname,
    contents: req.file.buffer,
    type: 'student_upload',
    assessment_id: res.locals.assessment.id,
    assessment_instance_id: res.locals.assessment_instance.id,
    instance_question_id: null,
    user_id: res.locals.user.user_id,
    authn_user_id: res.locals.authn_user.user_id,
  });
}

async function processTextUpload(req, res) {
  if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw new Error(`This assessment is not accepting submissions at this time.`);
  }
  await uploadFile({
    display_filename: req.body.filename,
    contents: Buffer.from(req.body.contents),
    type: 'student_upload',
    assessment_id: res.locals.assessment.id,
    assessment_instance_id: res.locals.assessment_instance.id,
    instance_question_id: null,
    user_id: res.locals.user.user_id,
    authn_user_id: res.locals.authn_user.user_id,
  });
}

async function processDeleteFile(req, res) {
  if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw new Error(`This assessment is not accepting submissions at this time.`);
  }

  // Check the requested file belongs to the current assessment instance
  const validFiles = (res.locals.file_list ?? []).filter((file) =>
    idsEqual(file.id, req.body.file_id),
  );
  if (validFiles.length === 0) throw new Error(`No such file_id: ${req.body.file_id}`);
  const file = validFiles[0];

  if (file.type !== 'student_upload') {
    throw new Error(`Cannot delete file type ${file.type} for file_id=${file.id}`);
  }

  await deleteFile(file.id, res.locals.authn_user.user_id);
}

router.post(
  '/',
  asyncHandler(async function (req, res, next) {
    if (
      !res.locals.authz_result.authorized_edit &&
      !res.locals.authz_data.has_course_instance_permission_edit
    ) {
      throw error.make(403, 'Not authorized');
    }
    if (
      !res.locals.authz_result.authorized_edit &&
      ['attach_file', 'attach_text', 'delete_file', 'timeLimitFinish', 'leave_group'].includes(
        req.body.__action,
      )
    ) {
      throw error.make(403, 'Action is only permitted to students, not staff');
    }

    if (req.body.__action === 'attach_file') {
      await processFileUpload(req, res);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'attach_text') {
      await processTextUpload(req, res);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_file') {
      await processDeleteFile(req, res);
      res.redirect(req.originalUrl);
    } else if (['grade', 'finish', 'timeLimitFinish'].includes(req.body.__action)) {
      const overrideGradeRate = false;
      var closeExam;
      if (req.body.__action === 'grade') {
        if (!res.locals.assessment.allow_real_time_grading) {
          throw error.make(403, 'Real-time grading is not allowed for this assessment');
        }
        closeExam = false;
      } else if (req.body.__action === 'finish') {
        closeExam = true;
      } else if (req.body.__action === 'timeLimitFinish') {
        // Only close if the timer expired due to time limit, not for access end
        if (!res.locals.assessment_instance_time_limit_expired) {
          return res.redirect(req.originalUrl);
        }
        closeExam = true;
      } else {
        throw error.make(400, `unknown __action: ${req.body.__action}`);
      }
      const requireOpen = true;
      await assessment.gradeAssessmentInstance(
        res.locals.assessment_instance.id,
        res.locals.authn_user.user_id,
        requireOpen,
        closeExam,
        overrideGradeRate,
        res.locals.client_fingerprint_id,
      );
      if (req.body.__action === 'timeLimitFinish') {
        res.redirect(req.originalUrl + '?timeLimitExpired=true');
      } else {
        res.redirect(req.originalUrl);
      }
    } else if (req.body.__action === 'leave_group') {
      if (!res.locals.authz_result.active) throw error.make(400, 'Unauthorized request.');
      await leaveGroup(
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/assessment/${res.locals.assessment.id}`,
      );
    } else if (req.body.__action === 'update_group_roles') {
      await updateGroupRoles(
        req.body,
        res.locals.assessment.id,
        res.locals.assessment_instance.group_id,
        res.locals.user.user_id,
        res.locals.authz_data.has_course_instance_permission_edit,
        res.locals.authn_user.user_id,
      );
      res.redirect(req.originalUrl);
    } else {
      next(error.make(400, `unknown __action: ${req.body.__action}`));
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (res.locals.assessment.type === 'Homework') {
      await ensureUpToDate(res.locals);
    }
    res.locals.instance_questions = await queryRows(
      sql.select_instance_questions,
      {
        assessment_instance_id: res.locals.assessment_instance.id,
        user_id: res.locals.user.user_id,
      },
      InstanceQuestionRowSchema,
    );

    res.locals.has_manual_grading_question = res.locals.instance_questions?.some(
      (q) => q.max_manual_points || q.manual_points || q.requires_manual_grading,
    );
    res.locals.has_auto_grading_question = res.locals.instance_questions?.some(
      (q) => q.max_auto_points || q.auto_points || !q.max_points,
    );
    const assessment_text_templated = assessment.renderText(
      res.locals.assessment,
      res.locals.urlPrefix,
    );
    res.locals.assessment_text_templated = assessment_text_templated;

    res.locals.showTimeLimitExpiredModal = req.query.timeLimitExpired === 'true';
    res.locals.savedAnswers = 0;
    res.locals.suspendedSavedAnswers = 0;
    res.locals.instance_questions.forEach((question) => {
      if (question.status === 'saved') {
        if (question.allow_grade_left_ms > 0) {
          res.locals.suspendedSavedAnswers++;
        } else {
          res.locals.savedAnswers++;
        }
      }
    });
    if (res.locals.assessment.group_work) {
      // Get the group config info
      const groupConfig = await getGroupConfig(res.locals.assessment.id);
      res.locals.groupConfig = groupConfig;

      res.locals.notInGroup = false;
      const groupInfo = await getGroupInfo(res.locals.assessment_instance.group_id, groupConfig);
      res.locals.groupSize = groupInfo.groupSize;
      res.locals.groupMembers = groupInfo.groupMembers;
      res.locals.joinCode = groupInfo.joinCode;
      res.locals.groupName = groupInfo.groupName;
      res.locals.start = groupInfo.start;
      res.locals.rolesInfo = groupInfo.rolesInfo;
      res.locals.used_join_code = req.body.used_join_code;

      if (groupConfig.has_roles) {
        res.locals.userCanAssignRoles = canUserAssignGroupRoles(groupInfo, res.locals.user.user_id);

        res.locals.user_group_roles =
          groupInfo.rolesInfo?.roleAssignments?.[res.locals.authz_data.user.uid]
            ?.map((role) => role.role_name)
            ?.join(', ') || 'None';
        // Get the role permissions. If the authorized user has course instance
        // permission, then role restrictions don't apply.
        if (!res.locals.authz_data.has_course_instance_permission_view) {
          for (const question of res.locals.instance_questions) {
            question.group_role_permissions = await getQuestionGroupPermissions(
              question.id,
              res.locals.assessment_instance.group_id,
              res.locals.authz_data.user.user_id,
            );
          }
        }
      }
    }
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
