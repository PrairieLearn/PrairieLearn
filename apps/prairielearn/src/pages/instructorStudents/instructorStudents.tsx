import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { stringifyStream } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryCursor, queryRows } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.html.js';
import { getCourseOwners } from '../../lib/course.js';
import { hydrate } from '../../lib/preact.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';

import { type StudentRow, StudentRowSchema } from './components/StudentsTable.js';
import { InstructorStudents, type ResLocals } from './instructorStudents.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

function buildCsvFilename(locals: Record<string, any>) {
  return courseInstanceFilenamePrefix(locals.course_instance, locals.course) + 'students.csv';
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const csvFilename = buildCsvFilename(res.locals);

    const resLocals = res.locals as ResLocals;
    if (!resLocals.authz_data.has_course_instance_permission_view) {
      // Similar to gradebook, show permission instructions instead of forbidding access
      const courseOwners = await getCourseOwners(resLocals.course.id);
      res.status(403).send(InstructorStudents({ resLocals, courseOwners, csvFilename }));
      return;
    }

    const students = await queryRows(
      sql.select_students,
      { course_instance_id: resLocals.course_instance.id },
      StudentRowSchema,
    );

    res.send(
      PageLayout({
        resLocals,
        pageTitle: 'Students',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'students',
        },
        options: {
          fullWidth: true,
        },
        content: hydrate(
          <InstructorStudents
            resLocals={resLocals}
            csvFilename={csvFilename}
            students={students}
          />,
        ),
      }),
    );
  }),
);

router.get(
  '/raw_data.json',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const students = await queryRows(
      sql.select_students,
      { course_instance_id: res.locals.course_instance.id },
      StudentRowSchema,
    );
    res.json(students);
  }),
);

/**
 * Download a CSV file of student data.
 *
 * @param req.params.filename - The filename of the CSV file to download.
 * @returns A CSV file of student data.
 */
router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    if (req.params.filename === buildCsvFilename(res.locals)) {
      const studentsCursor = await queryCursor(sql.select_students, {
        course_instance_id: res.locals.course_instance.id,
      });

      const stringifier = stringifyStream({
        header: true,
        columns: ['UID', 'Name', 'Email', 'Enrolled At'],
        transform: (record: StudentRow) => [
          record.uid,
          record.name,
          record.email,
          // ISO 8601 (yyyy-mm-dd hh:mm:ss) for Excel compatibility
          record.created_at ? new Date(record.created_at).toISOString().replace('T', ' ') : '',
        ],
      });

      res.attachment(req.params.filename);
      await pipeline(studentsCursor.stream(100), stringifier, res);
    } else {
      throw new HttpStatusError(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

export default router;
