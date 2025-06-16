import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { stringifyStream } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryCursor, queryRows } from '@prairielearn/postgres';

import { getCourseOwners } from '../../lib/course.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';

import { InstructorStudents } from './instructorStudents.html.js';
import { type StudentRow, StudentRowSchema } from './instructorStudents.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

function buildCsvFilename(locals: Record<string, any>) {
  return courseInstanceFilenamePrefix(locals.course_instance, locals.course) + 'students.csv';
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const csvFilename = buildCsvFilename(res.locals);

    if (!res.locals.authz_data.has_course_instance_permission_view) {
      // Similar to gradebook, show permission instructions instead of forbidding access
      const courseOwners = await getCourseOwners(res.locals.course.id);
      res
        .status(403)
        .send(InstructorStudents({ resLocals: res.locals, courseOwners, csvFilename }));
      return;
    }

    const students = await queryRows(
      sql.select_students,
      { course_instance_id: res.locals.course_instance.id },
      StudentRowSchema,
    );

    res.send(
      InstructorStudents({
        resLocals: res.locals,
        courseOwners: [], // Not needed in this context
        csvFilename,
        students,
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
        columns: ['UID', 'UIN', 'Name', 'Email', 'Role', 'Enrolled At'],
        transform: (record: StudentRow) => [
          record.uid,
          record.uin,
          record.user_name,
          record.email,
          record.role,
          record.created_at,
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
