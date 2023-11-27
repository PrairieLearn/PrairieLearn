import { selectCourseById } from '../../models/course';
import { selectQuestionById } from '../../models/question';
const error = require('@prairielearn/error');
var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router({ mergeParams: true });

var question = require('../../lib/question-variant');
var sqldb = require('@prairielearn/postgres');

var sql = sqldb.loadSqlEquiv(__filename);

router.get('/variant/:variant_id/*', function (req, res, next) {
  Promise.all(
    res.locals.public
      ? [selectCourseById(req.params.course_id), selectQuestionById(req.params.question_id)]
      : [Promise.resolve(res.locals.course), Promise.resolve(res.locals.question)],
  )
    .then(([course, questionData]) => {
      res.locals.course = course;
      res.locals.question = questionData;

      if (res.locals.public && !res.locals.question.shared_publicly) {
        return next(error.make(404, 'Not Found'));
      }

      var variant_id = req.params.variant_id;
      var filename = req.params[0];
      var params = {
        // The instance question generally won't be present if this is used on
        // an instructor route.
        has_instance_question: !!res.locals.instance_question,
        instance_question_id: res.locals.instance_question?.id,
        question_id: res.locals.question.id,
        variant_id: variant_id,
      };
      sqldb.queryOneRow(sql.select_variant, params, function (err, result) {
        if (ERR(err, next)) return;
        var variant = result.rows[0];

        question.getFile(
          filename,
          variant,
          res.locals.question,
          res.locals.course,
          res.locals.authn_user.user_id,
          function (err, fileData) {
            if (ERR(err, next)) return;
            res.attachment(filename);
            res.send(fileData);
          },
        );
      });
    })
    .catch((err) => next(err));
});

module.exports = router;
