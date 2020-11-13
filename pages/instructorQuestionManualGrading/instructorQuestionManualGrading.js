const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('@prairielearn/prairielib/error');
const question = require('../../lib/question');
const path = require('path');
const debug = require('debug')(
  'prairielearn:' + path.basename(__filename, '.js'),
);
const logPageView = require('../../middlewares/logPageView')(
  path.basename(__filename, '.js'),
);

/**
 * Submits the regraded partials to the regrading workflow.
 * Returns the variant ID of the current question.
 */
function submitPartials(req, res, callback) {
  const variant_id = req.body.__variant_id;
  const submitted_partials = _.omit(req.body, [
    '__action',
    '__csrf_token',
    '__variant_id',
  ]);

  const status = 'graded';
  const partials = {};
  for (const key in submitted_partials) {
    _.set(partials, key, submitted_partials[key]);
  }
  for (const key in partials) {
    partials[key].status = status;
  }

  // TODO: Send these partials off to the backend
  console.log(partials);
  callback(null, variant_id);
}

/**
 * Grabs the next question from the current assignment to grade.
 */
function getNextToGrade(req, res, callback) {
  // TODO: Implement.
  const variant_id = req.body.__variant_id;
  callback(error.make(501, 'Not implemented.'), variant_id);
}

router.post('/', function (req, res, next) {
  if (res.locals.question.type == 'Freeform') {
    const redirectToVariant = function (err, variant_id) {
      if (ERR(err, next)) return;
      res.redirect(
        `${res.locals.urlPrefix}/question/${res.locals.question.id}/manual_grading/?variant_id=${variant_id}`,
      );
    };

    switch (req.body.__action) {
      case 'grade':
        submitPartials(req, res, redirectToVariant);
        break;
      case 'next':
        getNextToGrade(req, res, redirectToVariant);
        break;
      default:
        next(
          error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
          }),
        );
    }
  } else {
    return next(
      error.make(
        400,
        'Manual grading is only supported for freeform (V3) questions',
        { locals: res.locals, body: req.body },
      ),
    );
  }
});

router.get('/', function (req, res, next) {
  var variant_id = req.query.variant_id;
  debug(`manually grading variant_id ${variant_id}`);

  if (variant_id) {
    res.locals.overlayGradingInterface = true;
    res.locals.allowAnswerEditing = false;
    async.series(
      [
        (callback) => {
          question.getAndRenderVariant(variant_id, null, res.locals, function (
            err,
          ) {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          logPageView(req, res, (err) => {
            if (ERR(err, next)) return;
            callback(null);
          });
        },
      ],
      (err) => {
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      },
    );
  } else {
    return next(
      error.make(400, 'no variant provided', {
        locals: res.locals,
        body: req.body,
      }),
    );
  }
});

module.exports = router;
