import { Readable } from 'node:stream';

import { CsvError } from 'csv-parse';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { createCsvParser } from './csv.js';
import {
  type EnumCourseInstanceRole,
  EnumCourseInstanceRoleSchema,
  type EnumCourseRole,
  EnumCourseRoleSchema,
} from './db-types.js';

export const COURSE_STAFF_CSV_MAX_ROWS = 5000;
export const COURSE_STAFF_CSV_MAX_BYTES = 1024 * 1024;

export type CourseStaffCsvOperation = { uid: string; line: number } & (
  | { action: 'remove' }
  | {
      action: 'update';
      courseRole: EnumCourseRole;
      courseInstanceRoles: { shortName: string; role: EnumCourseInstanceRole }[];
    }
);

export async function parseCourseStaffCsv(text: string): Promise<{
  courseInstanceNames: string[];
  operations: CourseStaffCsvOperation[];
}> {
  if (Buffer.byteLength(text, 'utf8') > COURSE_STAFF_CSV_MAX_BYTES) {
    throw new HttpStatusError(400, 'The staff CSV must be no larger than 1 MiB.');
  }

  const parser = createCsvParser(Readable.from([text]), {
    columns: false,
    cast: false,
    info: true,
    relaxColumnCount: false,
  });
  let headers: string[] | undefined;
  const seenUids = new Set<string>();
  const operations: CourseStaffCsvOperation[] = [];

  try {
    for await (const record of parser) {
      const { record: values, info } = z
        .object({ record: z.array(z.string()), info: z.object({ lines: z.number() }) })
        .parse(record);
      const row = values.map((value) => value.trim());
      if (!headers) {
        if (row[0] !== 'uid' || row[1] !== 'course') {
          throw new HttpStatusError(
            400,
            'The CSV must start with the headers uid,course, in that order.',
          );
        }
        // Reserved headers are positional: an instance can itself be named "course".
        const instanceNames = row.slice(2);
        if (instanceNames.includes('') || new Set(instanceNames).size !== instanceNames.length) {
          throw new HttpStatusError(400, 'Course instance headers must be nonempty and unique.');
        }
        headers = row;
        continue;
      }

      const line = info.lines;
      const uid = row[0];
      if (!uid) {
        throw new HttpStatusError(400, `Row ending on line ${line}: enter a staff UID.`);
      }
      if (seenUids.has(uid)) {
        throw new HttpStatusError(
          400,
          `Row ending on line ${line}: ${uid} appears more than once. Keep one row per staff user.`,
        );
      }
      seenUids.add(uid);
      if (seenUids.size > COURSE_STAFF_CSV_MAX_ROWS) {
        throw new HttpStatusError(400, 'Cannot synchronize more than 5,000 staff users at a time.');
      }
      if (row.slice(1).every((value) => value === '')) {
        operations.push({ action: 'remove', uid, line });
        continue;
      }
      for (let index = 1; index < row.length; index++) {
        if (row[index] === '') {
          throw new HttpStatusError(
            400,
            `Row ending on line ${line}, column ${index + 1} (${headers[index]}): enter a permission or None. Leave all permission cells blank only to remove staff.`,
          );
        }
      }
      const courseRole = EnumCourseRoleSchema.safeParse(row[1]);
      if (!courseRole.success) {
        throw new HttpStatusError(
          400,
          `Row ending on line ${line}, column 2 (course): invalid permission "${row[1]}". Use ${EnumCourseRoleSchema.options.join(', ')}.`,
        );
      }
      const instanceNames = headers.slice(2);
      const courseInstanceRoles = row.slice(2).map((value, index) => {
        const normalized =
          value === 'Editor'
            ? 'Student Data Editor'
            : value === 'Viewer'
              ? 'Student Data Viewer'
              : value;
        const role = EnumCourseInstanceRoleSchema.safeParse(normalized);
        if (!role.success) {
          throw new HttpStatusError(
            400,
            `Row ending on line ${line}, column ${index + 3} (${instanceNames[index]}): invalid permission "${value}". Use None, Student Data Viewer, or Student Data Editor (Viewer and Editor are also accepted).`,
          );
        }
        return { shortName: instanceNames[index], role: role.data };
      });
      operations.push({
        action: 'update',
        uid,
        line,
        courseRole: courseRole.data,
        courseInstanceRoles,
      });
    }
  } catch (error) {
    if (error instanceof CsvError) {
      throw new HttpStatusError(
        400,
        `Invalid CSV near line ${String(error.lines)}. Check the number of columns and quote cells containing commas or quotation marks.`,
        { cause: error },
      );
    }
    throw error;
  }

  if (!headers || operations.length === 0) {
    throw new HttpStatusError(400, 'Include at least one staff user below the CSV header.');
  }
  return { courseInstanceNames: headers.slice(2), operations };
}
