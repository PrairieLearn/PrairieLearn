import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { UserSchema } from '../../lib/db-types.js';
import { getDynamicFile } from '../../lib/question-variant.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';
import { selectAndAuthzVariant } from '../../models/variant.js';

export default function (options = { publicEndpoint: false }) {
  const router = Router({ mergeParams: true });
  router.get(
    '/variant/:unsafe_variant_id(\\d+)/*',
    asyncHandler(async function (req, res) {
      if (options.publicEndpoint) {
        res.locals.course = await selectCourseById(req.params.course_id);
        res.locals.question = await selectQuestionById(req.params.question_id);
        res.locals.user = UserSchema.parse(res.locals.authn_user);

        if (
          !(res.locals.question.share_publicly || res.locals.question.share_source_publicly) ||
          res.locals.course.id !== res.locals.question.course_id
        ) {
          throw new HttpStatusError(404, 'Not Found');
        }
      }

      const variant = await selectAndAuthzVariant({
        unsafe_variant_id: req.params.unsafe_variant_id,
        variant_course: res.locals.course,
        question_id: res.locals.question.id,
        course_instance_id: res.locals.course_instance?.id,
        instance_question_id: res.locals.instance_question?.id,
        authz_data: res.locals.authz_data,
        authn_user: res.locals.authn_user,
        user: res.locals.user,
        is_administrator: res.locals.is_administrator,
        publicQuestionPreview: options.publicEndpoint,
      });

      const filename = req.params[0];
      const fileData = await getDynamicFile(
        filename,
        variant,
        res.locals.question,
        res.locals.course,
        res.locals.user.id,
        res.locals.authn_user.id,
      );
      res.attachment(filename);
      res.send(fileData);
    }),
  );
  return router;
}
