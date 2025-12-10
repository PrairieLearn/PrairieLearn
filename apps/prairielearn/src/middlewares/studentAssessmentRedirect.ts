import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { IdSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export default asyncHandler(async (req, res, next) => {
  if (!res.locals.assessment.multiple_instance) {
    // If the assessment is single-instance, check if the user already has an
    // instance. If so, redirect to it.
    const assessment_instance_id = await queryOptionalRow(
      sql.select_single_assessment_instance,
      {
        assessment_id: res.locals.assessment.id,
        user_id: res.locals.user.id,
      },
      IdSchema,
    );
    if (assessment_instance_id != null) {
      res.redirect(`${res.locals.urlPrefix}/assessment_instance/${assessment_instance_id}`);
      return;
    }
  }
  next();
});
