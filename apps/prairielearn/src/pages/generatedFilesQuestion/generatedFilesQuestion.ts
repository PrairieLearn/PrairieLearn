import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { VariantSchema } from '../../lib/db-types.js';
import { getDynamicFile } from '../../lib/question-variant.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';

const sql = loadSqlEquiv(import.meta.url);

export default function (options = { publicEndpoint: false }) {
  const router = Router({ mergeParams: true });
  router.get(
    '/variant/:variant_id(\\d+)/*',
    asyncHandler(async function (req, res) {
      if (options.publicEndpoint) {
        res.locals.course = await selectCourseById(req.params.course_id);
        res.locals.question = await selectQuestionById(req.params.question_id);

        if (
          !res.locals.question.shared_publicly ||
          res.locals.course.id !== res.locals.question.course_id
        ) {
          throw new HttpStatusError(404, 'Not Found');
        }
      }

      const variant_id = req.params.variant_id;
      const filename = req.params[0];
      const variant = await queryRow(
        sql.select_variant,
        {
          // The instance question generally won't be present if this is used on
          // an instructor route.
          has_instance_question: !!res.locals.instance_question,
          instance_question_id: res.locals.instance_question?.id,
          question_id: res.locals.question.id,
          variant_id,
        },
        VariantSchema,
      );

      const fileData = await getDynamicFile(
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
}
