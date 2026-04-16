import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { checkCoursePathExists, checkCourseRepositoryUrlExists } from '../../lib/course.js';
import {
  deleteCourse,
  insertCourse,
  selectCourseById,
  updateCourseColumn,
} from '../../models/course.js';

import { normalizeCoursePathInput } from './course-path.js';
import { requireAdministrator, t } from './init.js';

export interface AdminCourseError {}

const insert = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      institutionId: IdSchema,
      shortName: z
        .string()
        .min(1, 'Short name is required')
        .regex(
          /^[A-Z]+ [A-Z0-9]+$/,
          'The course rubric and number should be a series of letters, followed by a space, followed by a series of numbers and/or letters.',
        ),
      title: z.string().min(1, 'Title is required').max(75, 'Title must be at most 75 characters'),
      displayTimezone: z.string().min(1, 'Timezone is required'),
      path: z.string().min(1, 'Path is required'),
      repository: z.string().min(1, 'Repository is required'),
      branch: z.string().min(1, 'Branch is required'),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const normalizedPath = normalizeCoursePathInput(input.path);

    const repoExists = await checkCourseRepositoryUrlExists(input.repository);
    if (repoExists) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A course with this repository already exists.',
      });
    }

    const pathExists = await checkCoursePathExists(normalizedPath);
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
      path: normalizedPath,
      repository: input.repository,
      branch: input.branch,
      authn_user_id: ctx.authn_user.id,
    });
  });

const deleteCourseProcedure = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      courseId: IdSchema,
      confirmShortName: z.string().min(1, 'Confirmation is required'),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const course = await selectCourseById(input.courseId);
    if (input.confirmShortName !== course.short_name) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Confirmation did not match the expected value.',
      });
    }

    await deleteCourse({
      course_id: input.courseId,
      authn_user_id: ctx.authn_user.id,
    });
  });

const updateColumn = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      courseId: IdSchema,
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
    let value = input.value;

    if (input.columnName === 'repository') {
      const repoExists = await checkCourseRepositoryUrlExists(value, input.courseId);
      if (repoExists) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A course with this repository already exists.',
        });
      }
    }

    if (input.columnName === 'path') {
      value = normalizeCoursePathInput(value);
      const pathExists = await checkCoursePathExists(value, input.courseId);
      if (pathExists) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A course with this path already exists.',
        });
      }
    }

    await updateCourseColumn({
      courseId: input.courseId,
      columnName: input.columnName,
      value,
      authnUserId: ctx.authn_user.id,
    });
  });

export const administratorCoursesRouter = t.router({
  insert,
  delete: deleteCourseProcedure,
  updateColumn,
});
