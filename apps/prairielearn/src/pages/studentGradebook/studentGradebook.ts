import { pipeline } from 'node:stream/promises';

import { Router } from 'express';

import { stringifyNonblocking } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';

import { getGradebookRows } from '../../lib/gradebook.js';
import {
  type StudentGradebookRow,
  computeLabel,
  computeTitle,
} from '../../lib/gradebook.shared.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';
import logPageView from '../../middlewares/logPageView.js';

import { StudentGradebook, type StudentGradebookTableRow } from './studentGradebook.html.js';

const router = Router();

function buildCsvFilename(locals: ResLocalsForPage<'course-instance'>) {
  return courseInstanceFilenamePrefix(locals.course_instance, locals.course) + 'gradebook.csv';
}

// TODO: The student gradebook should be refactored to use the new data model, rather than the old SQL data model.
// This was done to avoid substantial changes to the gradebook code, while still allowing for reuse of the gradebook SQL query.

function mapRow(
  raw: StudentGradebookRow,
  prev: StudentGradebookRow | null,
): StudentGradebookTableRow {
  const start_new_set = !prev || raw.assessment_set.id !== prev.assessment_set.id;
  return {
    assessment_id: raw.assessment.id,
    assessment_instance_id: raw.assessment_instance.id,
    assessment_group_work: raw.assessment.team_work,
    title: computeTitle(raw),
    assessment_set_heading: raw.assessment_set.heading,
    assessment_set_color: raw.assessment_set.color,
    label: computeLabel(raw),
    assessment_instance_score_perc: raw.assessment_instance.score_perc,
    show_closed_assessment_score: raw.show_closed_assessment_score,
    start_new_set,
  };
}

router.get(
  '/',
  logPageView('studentGradebook'),
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const rawRows = await getGradebookRows({
      course_instance_id: res.locals.course_instance.id,
      user_id: res.locals.user.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
      auth: 'student',
    });
    const rows = rawRows.map((row, index) => mapRow(row, rawRows[index - 1]));
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
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    if (req.params.filename !== buildCsvFilename(res.locals)) {
      throw new HttpStatusError(404, `Unknown filename: ${req.params.filename}`);
    }

    const rows = await getGradebookRows({
      course_instance_id: res.locals.course_instance.id,
      user_id: res.locals.user.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
      auth: 'student',
    });

    const csvData = rows.map((row) => [
      computeTitle(row),
      row.assessment_set.heading,
      row.show_closed_assessment_score ? row.assessment_instance.score_perc?.toFixed(6) : null,
    ]);

    const stringifier = stringifyNonblocking(csvData, {
      header: true,
      columns: ['Assessment', 'Set', 'Score'],
    });

    res.setHeader('Content-Type', 'text/csv');
    res.attachment(buildCsvFilename(res.locals));
    await pipeline(stringifier, res);
  }),
);

export default router;
