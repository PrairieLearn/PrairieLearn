/* eslint no-restricted-imports: ["error", {"patterns": ["db-types.js"] }] */
import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { stringifyStream } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';

import {
  type StudentGradebookRow,
  computeLabel,
  computeTitle,
  getGradebookRows,
  getGradebookRowsCursor,
} from '../../lib/gradebook.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';
import logPageView from '../../middlewares/logPageView.js';

import { StudentGradebook, type StudentGradebookTableRow } from './studentGradebook.html.js';

const router = Router();

function buildCsvFilename(locals: Record<string, any>) {
  return courseInstanceFilenamePrefix(locals.course_instance, locals.course) + 'gradebook.csv';
}

function mapRow(
  raw: StudentGradebookRow,
  prev: StudentGradebookRow | null,
): StudentGradebookTableRow {
  // true if this is the first row or assessment_set.id differs from previous
  const start_new_set = !prev || raw.assessment_set.id !== prev.assessment_set.id;
  return {
    assessment_id: raw.assessment.id,
    assessment_instance_id: raw.assessment_instance.id,
    assessment_group_work: raw.assessment.group_work ?? false,
    title: computeTitle(raw.assessment, raw.assessment_instance),
    assessment_set_heading: raw.assessment_set.heading,
    assessment_set_color: raw.assessment_set.color,
    label: computeLabel(raw.assessment, raw.assessment_instance, raw.assessment_set),
    assessment_instance_score_perc: raw.assessment_instance.score_perc,
    show_closed_assessment_score: raw.show_closed_assessment_score,
    start_new_set,
  };
}

router.use(logPageView('studentGradebook'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rawRows = await getGradebookRows({
      course_instance_id: res.locals.course_instance.id,
      user_id: res.locals.user.user_id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
      auth: 'student',
    });
    let prev: StudentGradebookRow | null = null;
    const rows = rawRows.map((row) => {
      const mapped = mapRow(row, prev);
      prev = row;
      return mapped;
    });
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

    const cursor = await getGradebookRowsCursor({
      course_instance_id: res.locals.course_instance.id,
      user_id: res.locals.user.user_id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
      auth: 'student',
    });
    const stringifier = stringifyStream<StudentGradebookRow>({
      header: true,
      columns: ['Assessment', 'Set', 'Score'],
      transform(row: StudentGradebookRow) {
        return [
          row.assessment.title,
          row.assessment_set.heading,
          row.show_closed_assessment_score ? row.assessment_instance.score_perc?.toFixed(6) : null,
        ];
      },
    });

    res.setHeader('Content-Type', 'text/csv');
    res.attachment(buildCsvFilename(res.locals));
    await pipeline(cursor.stream(100), stringifier, res);
  }),
);

export default router;
