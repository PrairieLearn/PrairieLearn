const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('@prairielearn/error');
const question = require('../../lib/question');
const sqldb = require('@prairielearn/postgres');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { logger } = require('@prairielearn/logger');
const {
  QuestionRenameEditor,
  QuestionDeleteEditor,
  QuestionCopyEditor,
} = require('../../lib/editors');
const { config } = require('../../lib/config');
const sql = sqldb.loadSqlEquiv(__filename);
const { encodePath } = require('../../lib/uri-util');
const { idsEqual } = require('../../lib/id');
const { generateSignedToken } = require('@prairielearn/signed-token');
const { copyQuestionBetweenCourses } = require('../../lib/copy-question');
const { callbackify } = require('node:util');
const { flash } = require('@prairielearn/flash');
const { features } = require('../../lib/features/index');
const { getCanonicalHost } = require('../../lib/url');

router.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw error.make(403, 'Access denied');
    }
    // We use a separate `test/` POST route so that we can always use the
    // route to distinguish between pages that need to execute course code
    // (this `test/` handler) and pages that need access to course content
    // editing (here the plain '/' POST handler).
    if (req.body.__action === 'test_once') {
      if (!res.locals.authz_data.has_course_permission_view) {
        throw error.make(403, 'Access denied (must be a course Viewer)');
      }
      const count = 1;
      const showDetails = true;
      const assessmentGroupWork = res.locals.assessment ? res.locals.assessment.group_work : false;
      const jobSequenceId = await question.startTestQuestion(
        count,
        showDetails,
        res.locals.question,
        assessmentGroupWork,
        res.locals.course_instance,
        res.locals.course,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'test_100') {
      if (!res.locals.authz_data.has_course_permission_view) {
        throw error.make(403, 'Access denied (must be a course Viewer)');
      }
      if (res.locals.question.grading_method !== 'External') {
        const count = 100;
        const showDetails = false;
        const assessmentGroupWork = res.locals.assessment
          ? res.locals.assessment.group_work
          : false;
        const jobSequenceId = await question.startTestQuestion(
          count,
          showDetails,
          res.locals.question,
          assessmentGroupWork,
          res.locals.course_instance,
          res.locals.course,
          res.locals.authn_user.user_id,
        );
        res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
      } else {
        throw new Error('Not supported for externally-graded questions');
      }
    } else {
      throw error.make(400, 'unknown __action: ' + req.body.__action, {
        locals: res.locals,
        body: req.body,
      });
    }
  }),
);

router.post('/', function (req, res, next) {
  if (res.locals.question.course_id !== res.locals.course.id) {
    return next(error.make(403, 'Access denied'));
  }
  if (req.body.__action === 'change_id') {
    debug(`Change qid from ${res.locals.question.qid} to ${req.body.id}`);
    if (!req.body.id) return next(new Error(`Invalid QID (was falsy): ${req.body.id}`));
    if (!/^[-A-Za-z0-9_/]+$/.test(req.body.id)) {
      return next(
        new Error(
          `Invalid QID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`,
        ),
      );
    }
    let qid_new;
    try {
      qid_new = path.normalize(req.body.id);
    } catch (err) {
      return next(new Error(`Invalid QID (could not be normalized): ${req.body.id}`));
    }
    if (res.locals.question.qid === qid_new) {
      debug('The new qid is the same as the old qid - do nothing');
      res.redirect(req.originalUrl);
    } else {
      const editor = new QuestionRenameEditor({
        locals: res.locals,
        qid_new: qid_new,
      });
      editor.canEdit((err) => {
        if (ERR(err, next)) return;
        editor.doEdit((err, job_sequence_id) => {
          if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
            res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
          } else {
            res.redirect(req.originalUrl);
          }
        });
      });
    }
  } else if (req.body.__action === 'copy_question') {
    debug('Copy question');
    if (idsEqual(req.body.to_course_id, res.locals.course.id)) {
      // In this case, we are making a duplicate of this question in the same course
      const editor = new QuestionCopyEditor({
        locals: res.locals,
      });
      editor.canEdit((err) => {
        if (ERR(err, next)) return;
        editor.doEdit((err, job_sequence_id) => {
          if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
            res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
          } else {
            debug(
              `Get question_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`,
            );
            sqldb.queryOneRow(
              sql.select_question_id_from_uuid,
              { uuid: editor.uuid, course_id: res.locals.course.id },
              (err, result) => {
                if (ERR(err, next)) return;
                flash(
                  'success',
                  'Question copied successfully. You are now viewing your copy of the question.',
                );
                res.redirect(
                  res.locals.urlPrefix + '/question/' + result.rows[0].question_id + '/settings',
                );
              },
            );
          }
        });
      });
    } else {
      callbackify(copyQuestionBetweenCourses)(
        res,
        {
          fromCourse: res.locals.course,
          toCourseId: req.body.to_course_id,
          question: res.locals.question,
        },
        (err) => {
          if (ERR(err, next)) return;
          // `copyQuestionBetweenCourses` performs the redirect automatically,
          // so if there wasn't an error, there's nothing to do here.
        },
      );
    }
  } else if (req.body.__action === 'delete_question') {
    debug('Delete question');
    const editor = new QuestionDeleteEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          res.redirect(res.locals.urlPrefix + '/course_admin/questions');
        }
      });
    });
  } else if (req.body.__action === 'sharing_set_add') {
    debug('Add question to sharing set');
    features.enabledFromLocals('question-sharing', res.locals).then((questionSharingEnabled) => {
      if (!questionSharingEnabled) {
        next(error.make(403, 'Access denied (feature not available)'));
      }
      sqldb.queryZeroOrOneRow(
        sql.sharing_set_add,
        {
          course_id: res.locals.course.id,
          question_id: res.locals.question.id,
          unsafe_sharing_set_id: req.body.unsafe_sharing_set_id,
        },
        (err) => {
          if (ERR(err, next)) return;
          res.redirect(req.originalUrl);
        },
      );
    });
  } else {
    next(
      error.make(400, 'unknown __action: ' + req.body.__action, {
        locals: res.locals,
        body: req.body,
      }),
    );
  }
});

router.get('/', function (req, res, next) {
  if (res.locals.question.course_id !== res.locals.course.id) {
    return next(error.make(403, 'Access denied'));
  }
  // Construct the path of the question test route. We'll do this based on
  // `originalUrl` so that this router doesn't have to be aware of where it's
  // mounted.
  const host = getCanonicalHost(req);
  let questionTestPath = new URL(`${host}${req.originalUrl}`).pathname;
  if (!questionTestPath.endsWith('/')) {
    questionTestPath += '/';
  }
  questionTestPath += 'test';

  // Generate a CSRF token for the test route. We can't use `res.locals.__csrf_token`
  // here because this form will actually post to a different route, not `req.originalUrl`.
  const questionTestCsrfToken = generateSignedToken(
    { url: questionTestPath, authn_user_id: res.locals.authn_user.user_id },
    config.secretKey,
  );

  res.locals.questionTestPath = questionTestPath;
  res.locals.questionTestCsrfToken = questionTestCsrfToken;

  async.series(
    [
      (callback) => {
        res.locals.questionGHLink = null;
        if (res.locals.course.repository) {
          const GHfound = res.locals.course.repository.match(
            /^git@github.com:\/?(.+?)(\.git)?\/?$/,
          );
          if (GHfound) {
            res.locals.questionGHLink =
              'https://github.com/' +
              GHfound[1] +
              '/tree/master/questions/' +
              res.locals.question.qid;
          }
        } else if (res.locals.course.example_course) {
          res.locals.questionGHLink = `https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/${res.locals.question.qid}`;
        }
        callback(null);
      },
      (callback) => {
        sqldb.queryOneRow(sql.qids, { course_id: res.locals.course.id }, (err, result) => {
          if (ERR(err, callback)) return;
          res.locals.qids = result.rows[0].qids;
          callback(null);
        });
      },
      (callback) => {
        sqldb.query(
          sql.select_assessments_with_question_for_display,
          { question_id: res.locals.question.id },
          (err, result) => {
            if (ERR(err, callback)) return;
            res.locals.a_with_q_for_all_ci = result.rows[0].assessments_from_question_id;
            callback(null);
          },
        );
      },
      async () => {
        let result = await sqldb.queryAsync(sql.select_sharing_sets, {
          question_id: res.locals.question.id,
          course_id: res.locals.course.id,
        });
        res.locals.sharing_sets_in = result.rows.filter((row) => row.in_set);
        res.locals.sharing_sets_other = result.rows.filter((row) => !row.in_set);
      },
    ],
    (err) => {
      if (ERR(err, next)) return;
      res.locals.infoPath = encodePath(
        path.join('questions', res.locals.question.qid, 'info.json'),
      );
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    },
  );
});

module.exports = router;
