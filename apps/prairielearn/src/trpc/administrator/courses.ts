import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { coursePathAvailability, courseRepositoryAvailability } from '../../lib/course.js';
import {
  deleteCourse,
  insertCourse,
  selectCourseById,
  updateCourseColumn,
} from '../../models/course.js';
import { requireAdministrator, t } from '../trpc.js';

const insertCourseMutation = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      institutionId: z.string().min(1, 'Institution is required'),
      shortName: z.string().min(1, 'Short name is required'),
      title: z.string().min(1, 'Title is required'),
      displayTimezone: z.string().min(1, 'Timezone is required'),
      path: z.string().min(1, 'Path is required'),
      repository: z.string().min(1, 'Repository is required'),
      branch: z.string().min(1, 'Branch is required'),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const repoExists = await courseRepositoryAvailability(input.repository);
    if (repoExists) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A course with this repository already exists.',
      });
    }

    const pathExists = await coursePathAvailability(input.path);
    if (pathExists) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A course with this path already exists.',
      });
    }

    await insertCourse({
      institution_id: input.institutionId,
      short_name: input.shortName,
      title: input.title,
      display_timezone: input.displayTimezone,
      path: input.path,
      repository: input.repository,
      branch: input.branch,
      authn_user_id: ctx.authn_user.id,
    });
  });

const deleteCourseMutation = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      courseId: z.string().min(1),
      confirmShortName: z.string().min(1, 'Confirmation is required'),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const course = await selectCourseById(input.courseId);
    if (input.confirmShortName !== course.short_name) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `deletion aborted: confirmation string "${input.confirmShortName}" did not match expected value of "${course.short_name}"`,
      });
    }

    await deleteCourse({
      course_id: input.courseId,
      authn_user_id: ctx.authn_user.id,
    });
  });

const updateCourseColumnMutation = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      courseId: z.string(),
      columnName: z.enum([
        'short_name',
        'title',
        'display_timezone',
        'path',
        'repository',
        'branch',
      ]),
      value: z.string().min(1, 'Value is required'),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    await updateCourseColumn({
      courseId: input.courseId,
      columnName: input.columnName,
      value: input.value,
      authnUserId: ctx.authn_user.id,
    });
  });

export const administratorCoursesRouter = t.router({
  insertCourseMutation,
  deleteCourseMutation,
  updateCourseColumnMutation,
});

export type AdministratorCoursesRouter = typeof administratorCoursesRouter;
