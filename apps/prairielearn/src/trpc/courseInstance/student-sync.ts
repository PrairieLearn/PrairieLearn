import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { StaffStudentLabelSchema } from '../../lib/client/safe-db-types.js';
import { parseStudentSyncCsv } from '../../lib/student-sync.js';
import { selectUsersAndEnrollmentsForCourseInstance } from '../../models/enrollment.js';
import { selectStudentLabelsInCourseInstance } from '../../models/student-label.js';
import { computeSyncDiff } from '../../pages/instructorStudents/components/sync-students-diff.js';
import {
  MAX_SYNC_CSV_TEXT_LENGTH,
  StudentRowSchema,
} from '../../pages/instructorStudents/instructorStudents.shared.js';

import { requireCourseInstancePermissionEdit, t } from './init.js';

export interface StudentSyncError {
  Preview: never;
}

export const studentSyncRouter = t.router({
  preview: t.procedure
    .use(requireCourseInstancePermissionEdit)
    .input(z.object({ text: z.string().min(1).max(MAX_SYNC_CSV_TEXT_LENGTH) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.course_instance.modern_publishing) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Modern publishing is not enabled for this course instance.',
        });
      }
      const labels = await selectStudentLabelsInCourseInstance(ctx.course_instance);
      let rows;
      try {
        rows = await parseStudentSyncCsv(input.text, labels);
      } catch (error) {
        if (error instanceof HttpStatusError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
        }
        throw error;
      }
      const students = await selectUsersAndEnrollmentsForCourseInstance(ctx.course_instance);
      return {
        preview: computeSyncDiff(
          [...rows.keys()],
          students.map((row) => StudentRowSchema.parse(row)),
          rows,
        ),
        labels: labels.map((label) => StaffStudentLabelSchema.parse(label)),
      };
    }),
});
