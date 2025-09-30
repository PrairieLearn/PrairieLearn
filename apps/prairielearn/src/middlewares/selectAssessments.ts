import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const SelectAssessmentsSchema = z.object({
  assessment_label: z.string(),
  id: IdSchema,
  title: z.string(),
});

export default asyncHandler(async (req, res, next) => {
  const rows = await sqldb.queryRows(
    sql.select_assessments,
    {
      course_instance_id: res.locals.course_instance.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
      assessment_set_id: res.locals.assessment_set.id,
    },
    SelectAssessmentsSchema,
  );
  res.locals.assessments = rows;
  next();
});
