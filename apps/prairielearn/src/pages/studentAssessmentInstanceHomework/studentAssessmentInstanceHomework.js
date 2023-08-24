const util = require('util');
const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const _ = require('lodash');

const assessment = require('../../lib/assessment');
const studentAssessmentInstance = require('../shared/studentAssessmentInstance');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');
var groupAssessmentHelper = require('../../lib/groups');

const sql = sqldb.loadSqlEquiv(__filename);

const ensureUpToDate = (locals, callback) => {
  debug('ensureUpToDate()');
  assessment.update(locals.assessment_instance.id, locals.authn_user.user_id, (err, updated) => {
    if (ERR(err, callback)) return;

    debug('updated:', updated);
    if (!updated) return callback(null);

    // we updated the assessment_instance, so reload it

    debug('selecting assessment instance');
    const params = { assessment_instance_id: locals.assessment_instance.id };
    sqldb.queryOneRow(sql.select_assessment_instance, params, (err, result) => {
      if (ERR(err, callback)) return;
      locals.assessment_instance = result.rows[0];
      debug('selected assessment_instance.id:', locals.assessment_instance.id);
      callback(null);
    });
  });
};
const ensureUpToDateAsync = async (locals) => {
  await util.promisify(ensureUpToDate)(locals);
};

router.get(
  '/',
  asyncHandler(async function (req, res, next) {
    debug('GET');
    if (res.locals.assessment.type !== 'Homework') return next();
    debug('is Homework');

    await ensureUpToDateAsync(res.locals);

    debug('selecting questions');
    const params = {
      assessment_instance_id: res.locals.assessment_instance.id,
      user_id: res.locals.user.user_id,
    };
    const result = await sqldb.queryAsync(sql.get_questions, params);
    res.locals.questions = result.rows;
    debug('number of questions:', res.locals.questions.length);

    res.locals.has_manual_grading_question = _.some(
      res.locals.questions,
      (q) => q.max_manual_points || q.manual_points || q.requires_manual_grading,
    );
    res.locals.has_auto_grading_question = _.some(
      res.locals.questions,
      (q) => q.max_auto_points || q.auto_points || !q.max_points,
    );

    debug('rendering assessment text');
    const assessment_text_templated = assessment.renderText(
      res.locals.assessment,
      res.locals.urlPrefix,
    );
    res.locals.assessment_text_templated = assessment_text_templated;

    debug('rendering EJS');
    if (res.locals.assessment.group_work) {
      // Get the group config info
      const groupConfig = await groupAssessmentHelper.getGroupConfig(res.locals.assessment.id);
      res.locals.groupConfig = groupConfig;

      // Check whether the user is currently in a group in the current assessment by trying to get a group_id
      const groupId = await groupAssessmentHelper.getGroupId(
        res.locals.assessment.id,
        res.locals.user.user_id,
      );

      if (groupId === null) {
        throw error.make(403, 'Not a group member.');
      } else {
        res.locals.notInGroup = false;
        const groupInfo = await groupAssessmentHelper.getGroupInfo(groupId, groupConfig);
        res.locals.groupSize = groupInfo.groupSize;
        res.locals.groupMembers = groupInfo.groupMembers;
        res.locals.joinCode = groupInfo.joinCode;
        res.locals.groupName = groupInfo.groupName;
        res.locals.start = groupInfo.start;
        res.locals.rolesInfo = groupInfo.rolesInfo;

        if (groupConfig.has_roles) {
          const result = await groupAssessmentHelper.getAssessmentPermissions(
            res.locals.assessment.id,
            res.locals.user.user_id,
          );
          res.locals.canViewRoleTable = result.can_assign_roles_at_start;
        }
      }
    }
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

router.post(
  '/',
  asyncHandler(async function (req, res, next) {
    if (res.locals.assessment.type !== 'Homework') return next();
    if (!res.locals.authz_result.authorized_edit) {
      throw error.make(403, 'Not authorized', res.locals);
    }

    if (req.body.__action === 'attach_file') {
      util.callbackify(studentAssessmentInstance.processFileUpload)(req, res, function (err) {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
    } else if (req.body.__action === 'attach_text') {
      util.callbackify(studentAssessmentInstance.processTextUpload)(req, res, function (err) {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
    } else if (req.body.__action === 'delete_file') {
      util.callbackify(studentAssessmentInstance.processDeleteFile)(req, res, function (err) {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
      });
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

module.exports = router;
