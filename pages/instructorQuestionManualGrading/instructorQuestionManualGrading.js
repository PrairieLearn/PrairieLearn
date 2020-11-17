const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('@prairielearn/prairielib/error');
const question = require('../../lib/question');
const path = require('path');

const logPageView = require('../../middlewares/logPageView')(
  path.basename(__filename, '.js'),
);


router.post('/', function (req, res, next) {
  // TODO:
  if (!res.locals.authz_data.has_instructor_edit) return next();
});

router.get('/', function (req, res, next) {
  // TODO:
  if (!res.locals.authz_data.has_instructor_edit) return next();
  
  var variant_id = req.query.variant_id;

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
