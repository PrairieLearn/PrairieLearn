const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const async = require('async');
const path = require('path');
const { callbackify } = require('util');
const asyncHandler = require('express-async-handler');

const sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');

const {
  getAndRenderVariant,
  renderPanelsForSubmission,
  setRendererHeader,
} = require('../../lib/question-render');
const issues = require('../../lib/issues');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const logPageView = require('../../middlewares/logPageView')(path.basename(__filename, '.js'));
const { setQuestionCopyTargets } = require('../../lib/copy-question');
const { processSubmission } = require('../../lib/questionPreview');

const router = express.Router();

async function processIssue(req, res) {
  const description = req.body.description;
  if (!_.isString(description) || description.length === 0) {
    throw error.make(400, 'A description of the issue must be provided');
  }

  const variantId = req.body.__variant_id;
  await sqldb.callOneRowAsync('variants_ensure_question', [variantId, res.locals.question.id]);
  await issues.insertIssue({
    variantId,
    studentMessage: description,
    instructorMessage: 'instructor-reported issue',
    manuallyReported: true,
    courseCaused: true,
    courseData: _.pick(res.locals, ['variant', 'question', 'course_instance', 'course']),
    systemData: {},
    authnUserId: res.locals.authn_user.user_id,
  });
  return variantId;
}

router.post('/', function (req, res, next) {
  if (req.body.__action === 'grade' || req.body.__action === 'save') {
    processSubmission(req, res, function (err, variant_id) {
      if (ERR(err, next)) return;
      res.redirect(
        res.locals.urlPrefix +
          '/question/' +
          res.locals.question.id +
          '/preview/?variant_id=' +
          variant_id,
      );
    });
  } else if (req.body.__action === 'report_issue') {
    callbackify(processIssue)(req, res, function (err, variant_id) {
      if (ERR(err, next)) return;
      res.redirect(
        res.locals.urlPrefix +
          '/question/' +
          res.locals.question.id +
          '/preview/?variant_id=' +
          variant_id,
      );
    });
  } else {
    next(error.make(400, `unknown __action: ${req.body.__action}`));
  }
});

router.get(
  '/variant/:variant_id/submission/:submission_id',
  asyncHandler(async (req, res) => {
    const { submissionPanel } = await renderPanelsForSubmission({
      submission_id: req.params.submission_id,
      question_id: res.locals.question.id,
      instance_question_id: null,
      variant_id: req.params.variant_id,
      urlPrefix: res.locals.urlPrefix,
      questionContext: null,
      csrfToken: null,
      authorizedEdit: null,
      renderScorePanels: false,
    });
    res.send({ submissionPanel });
  }),
);

router.get('/', function (req, res, next) {
  var variant_seed = req.query.variant_seed ? req.query.variant_seed : null;
  debug(`variant_seed ${variant_seed}`);
  async.series(
    [
      async () => {
        // req.query.variant_id might be undefined, which will generate a new variant
        await getAndRenderVariant(req.query.variant_id, variant_seed, res.locals);
      },
      (callback) => {
        logPageView(req, res, (err) => {
          if (ERR(err, next)) return;
          callback(null);
        });
      },
      async () => await setQuestionCopyTargets(res),
    ],
    (err) => {
      if (ERR(err, next)) return;
      setRendererHeader(res);
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    },
  );
});

module.exports = router;
