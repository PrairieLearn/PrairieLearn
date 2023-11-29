// @ts-check
import { selectCourseById } from '../../models/course';
import { selectQuestionById } from '../../models/question';
import { promisify } from 'util';

const asyncHandler = require('express-async-handler');
const error = require('@prairielearn/error');
var express = require('express');

var question = require('../../lib/question-variant');
var sqldb = require('@prairielearn/postgres');

var sql = sqldb.loadSqlEquiv(__filename);

module.exports = function (options = { publicEndpoint: false }) {
  const router = express.Router({ mergeParams: true });
  router.get(
    '/variant/:variant_id/*',
    asyncHandler(async function (req, res) {
      if (options.publicEndpoint) {
        res.locals.course = await selectCourseById(req.params.course_id);
        res.locals.question = await selectQuestionById(req.params.question_id);
        
        if (!res.locals.question.shared_publicly) {
          throw error.make(404, 'Not Found');
        }
      }

      var variant_id = req.params.variant_id;
      var filename = req.params[0];
      const result = await sqldb.queryOneRowAsync(sql.select_variant, {
        // The instance question generally won't be present if this is used on
        // an instructor route.
        has_instance_question: !!res.locals.instance_question,
        instance_question_id: res.locals.instance_question?.id,
        question_id: res.locals.question.id,
        variant_id: variant_id,
      });
      const variant = result.rows[0];

      const fileData = await promisify(question.getFile)(
        filename,
        variant,
        res.locals.question,
        res.locals.course,
        res.locals.authn_user.user_id,
      );
      res.attachment(filename);
      res.send(fileData);
    }),
  );
  return router;
};
