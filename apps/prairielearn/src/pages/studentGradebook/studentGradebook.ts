import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { stringifyStream } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRows, queryValidatedCursor } from '@prairielearn/postgres';

import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';
import logPageView from '../../middlewares/logPageView.js';

import {
  StudentGradebook,
  type StudentGradebookRow,
  StudentGradebookRowSchema,
} from './studentGradebook.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router();

function buildCsvFilename(locals: Record<string, any>) {
  return courseInstanceFilenamePrefix(locals.course_instance, locals.course) + 'gradebook.csv';
}

router.use(logPageView('studentGradebook'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await queryRows(
      sql.select_assessment_instances,
      {
        course_instance_id: res.locals.course_instance.id,
        user_id: res.locals.user.user_id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
      },
      StudentGradebookRowSchema,
    );
    res.send(
      StudentGradebook({
        resLocals: res.locals,
        rows,
        csvFilename: buildCsvFilename(res.locals),
      }),
    );
  }),
);

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    if (req.params.filename !== buildCsvFilename(res.locals)) {
      throw new HttpStatusError(404, `Unknown filename: ${req.params.filename}`);
    }

    const cursor = await queryValidatedCursor(
      sql.select_assessment_instances,
      {
        course_instance_id: res.locals.course_instance.id,
        user_id: res.locals.user.user_id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
      },
      StudentGradebookRowSchema,
    );

    const stringifier = stringifyStream<StudentGradebookRow>({
      header: true,
      columns: ['Assessment', 'Set', 'Score'],
      transform(row) {
        return [
          row.title,
          row.assessment_set_heading,
          row.show_closed_assessment_score ? row.assessment_instance_score_perc?.toFixed(6) : null,
        ];
      },
    });

    res.setHeader('Content-Type', 'text/csv');
    res.attachment(buildCsvFilename(res.locals));
    await pipeline(cursor.stream(100), stringifier, res);
  }),
);

export default router;
