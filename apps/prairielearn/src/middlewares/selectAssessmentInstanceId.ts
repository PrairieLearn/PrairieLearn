import { Router } from 'express';

import { AugmentedError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { IdSchema } from '../lib/db-types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.all('/', async function (req, res, next) {
  if (res.locals.assessment.multiple_instance) {
    if (res.locals.assessment.type === 'Homework') {
      throw new AugmentedError('"Homework" assessments do not support multiple instances', {
        data: { assessment: res.locals.assessment },
      });
    }
    // The user has landed on this page to create a new assessment instance.
    // Proceed even if there are existing instances.
  } else {
    // If the assessment is single-instance, check if the user already has an
    // instance. If so, redirect to it.
    const assessment_instance_id = await queryOptionalRow(
      sql.select_single_assessment_instance,
      {
        assessment_id: res.locals.assessment.id,
        user_id: res.locals.user.user_id,
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

export default router;
