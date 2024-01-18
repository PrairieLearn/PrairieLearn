const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router();

const error = require('@prairielearn/error');
const assessment = require('../../lib/assessment');
const studentAssessmentInstance = require('../shared/studentAssessmentInstance');
const sqldb = require('@prairielearn/postgres');
const groupAssessmentHelper = require('../../lib/groups');
const { AssessmentInstanceSchema } = require('../../lib/db-types');

const sql = sqldb.loadSqlEquiv(__filename);

async function ensureUpToDate(locals) {
  const updated = await assessment.update(locals.assessment_instance.id, locals.authn_user.user_id);
  if (updated) {
    // we updated the assessment_instance, so reload it
    locals.assessment_instance = await sqldb.queryRow(
      sql.select_assessment_instance,
      { assessment_instance_id: locals.assessment_instance.id },
      AssessmentInstanceSchema,
    );
  }
}

router.post(
  '/',
  asyncHandler(async function (req, res, next) {
    if (
      !res.locals.authz_result.authorized_edit &&
      !res.locals.authz_data.has_course_instance_permission_edit
    ) {
      throw error.make(403, 'Not authorized', res.locals);
    }

    if (req.body.__action === 'attach_file') {
      await studentAssessmentInstance.processFileUpload(req, res);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'attach_text') {
      await studentAssessmentInstance.processTextUpload(req, res);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_file') {
      await studentAssessmentInstance.processDeleteFile(req, res);
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
        throw error.make(400, 'unknown __action', {
          locals: res.locals,
          body: req.body,
        });
      }
      const requireOpen = true;
      await assessment.gradeAssessmentInstanceAsync(
        res.locals.assessment_instance.id,
        res.locals.authn_user.user_id,
        requireOpen,
        closeExam,
        overrideGradeRate,
      );
      if (req.body.__action === 'timeLimitFinish') {
        res.redirect(req.originalUrl + '?timeLimitExpired=true');
      } else {
        res.redirect(req.originalUrl);
      }
    } else if (req.body.__action === 'leave_group') {
      if (!res.locals.authz_result.active) throw error.make(400, 'Unauthorized request.');
      await groupAssessmentHelper.leaveGroup(
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(
        '/pl/course_instance/' +
          res.locals.course_instance.id +
          '/assessment/' +
          res.locals.assessment.id,
      );
    } else if (req.body.__action === 'update_group_roles') {
      await groupAssessmentHelper.updateGroupRoles(
        req.body,
        res.locals.assessment.id,
        res.locals.assessment_instance.group_id,
        res.locals.user.user_id,
        res.locals.authz_data.has_course_instance_permission_edit,
        res.locals.authn_user.user_id,
      );
      res.redirect(req.originalUrl);
    } else {
      next(
        error.make(400, 'unknown __action', {
          locals: res.locals,
          body: req.body,
        }),
      );
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (res.locals.assessment.type === 'Homework') {
      await ensureUpToDate(res.locals);
    }
    const params = {
      assessment_instance_id: res.locals.assessment_instance.id,
      user_id: res.locals.user.user_id,
    };
    const result = await sqldb.queryAsync(sql.select_instance_questions, params);
    res.locals.instance_questions = result.rows;

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
      const groupConfig = await groupAssessmentHelper.getGroupConfig(res.locals.assessment.id);
      res.locals.groupConfig = groupConfig;

      res.locals.notInGroup = false;
      const groupInfo = await groupAssessmentHelper.getGroupInfo(
        res.locals.assessment_instance.group_id,
        groupConfig,
      );
      res.locals.groupSize = groupInfo.groupSize;
      res.locals.groupMembers = groupInfo.groupMembers;
      res.locals.joinCode = groupInfo.joinCode;
      res.locals.groupName = groupInfo.groupName;
      res.locals.start = groupInfo.start;
      res.locals.rolesInfo = groupInfo.rolesInfo;
      res.locals.used_join_code = req.body.used_join_code;

      if (groupConfig.has_roles) {
        const result = await groupAssessmentHelper.getAssessmentPermissions(
          res.locals.assessment.id,
          res.locals.user.user_id,
        );
        res.locals.userCanAssignRoles = result.can_assign_roles_at_start;

        res.locals.user_group_roles =
          groupInfo.rolesInfo?.roleAssignments?.[res.locals.authz_data.user.uid]
            ?.map((role) => role.role_name)
            ?.join(', ') || 'None';
        // Get the role permissions. If the authorized user is a staff member, then they have all permissions.
        if (!res.locals.authz_data.has_course_instance_permission_view) {
          for (const question of res.locals.instance_questions) {
            question.group_role_permissions =
              await groupAssessmentHelper.getQuestionGroupPermissions(
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

module.exports = router;
