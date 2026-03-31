import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import {
  checkInstructorLegitimacy,
  suggestInstitutionPrefix,
} from '../../lib/course-request-ai.js';
import {
  createCourseFromRequest,
  denyCourseRequest,
  selectCourseRequestById,
  selectInstitutionPrefix,
  updateCourseRequestNote,
} from '../../lib/course-request.js';
import { checkCoursePathExists, checkCourseRepositoryExists } from '../../lib/course.js';

import { normalizeCoursePathInput } from './course-path.js';
import { requireAdministrator, t } from './init.js';

const deny = t.procedure
  .use(requireAdministrator)
  .input(z.object({ courseRequestId: IdSchema }))
  .mutation(async ({ input, ctx }) => {
    await denyCourseRequest({
      courseRequestId: input.courseRequestId,
      authnUser: ctx.authn_user,
    });
  });

const updateNote = t.procedure
  .use(requireAdministrator)
  .input(z.object({ courseRequestId: IdSchema, note: z.string() }))
  .mutation(async ({ input }) => {
    await updateCourseRequestNote({
      courseRequestId: input.courseRequestId,
      note: input.note,
    });
  });

const createCourse = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      courseRequestId: IdSchema,
      shortName: z
        .string()
        .min(1, 'Short name is required')
        .regex(
          /^[A-Z]+ [A-Z0-9]+$/,
          'The course rubric and number should be a series of letters, followed by a space, followed by a series of numbers and/or letters.',
        ),
      title: z.string().min(1, 'Title is required').max(75, 'Title must be at most 75 characters'),
      institutionId: IdSchema,
      displayTimezone: z.string().min(1, 'Timezone is required'),
      path: z.string().min(1, 'Path is required'),
      repoShortName: z.string().min(1, 'Repository name is required'),
      githubUser: z.string(),
    }),
  )
  .output(z.object({ jobSequenceId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const normalizedPath = normalizeCoursePathInput(input.path);

    const repoExists = await checkCourseRepositoryExists(input.repoShortName);
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

    const jobSequenceId = await createCourseFromRequest({
      courseRequestId: input.courseRequestId,
      shortName: input.shortName,
      title: input.title,
      institutionId: input.institutionId,
      displayTimezone: input.displayTimezone,
      path: normalizedPath,
      repoShortName: input.repoShortName,
      githubUser: input.githubUser.trim().length > 0 ? input.githubUser.trim() : null,
      authnUser: ctx.authn_user,
    });
    return { jobSequenceId };
  });

const SourcesSchema = z
  .array(z.object({ url: z.string().url(), title: z.string().optional() }))
  .transform((sources) =>
    sources.filter((s) => {
      try {
        const parsed = new URL(s.url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    }),
  );

const checkInstructorLegitimacyProcedure = t.procedure
  .use(requireAdministrator)
  .input(z.object({ courseRequestId: IdSchema }))
  .output(
    z.object({
      summary: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
      legitimate: z.boolean(),
      sources: SourcesSchema,
    }),
  )
  .query(async ({ input }) => {
    const courseRequest = await selectCourseRequestById({
      courseRequestId: input.courseRequestId,
    });

    return await checkInstructorLegitimacy({
      instructorFirstName: courseRequest.first_name,
      instructorLastName: courseRequest.last_name,
      instructorEmail: courseRequest.work_email,
      institution: courseRequest.institution,
      userDisplayName: courseRequest.user_name,
      userUid: courseRequest.user_uid,
    });
  });

const selectInstitutionPrefixProcedure = t.procedure
  .use(requireAdministrator)
  .input(z.object({ institutionId: IdSchema }))
  .output(
    z.object({
      prefix: z.string().nullable(),
    }),
  )
  .query(async ({ input }) => {
    const row = await selectInstitutionPrefix({ institutionId: input.institutionId });
    return { prefix: row?.prefix ?? null };
  });

const suggestInstitutionPrefixProcedure = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      institutionLongName: z.string(),
      institutionShortName: z.string(),
      emailDomain: z.string(),
    }),
  )
  .output(
    z.object({
      prefix: z.string(),
      reasoning: z.string(),
      sources: SourcesSchema,
    }),
  )
  .query(async ({ input }) => {
    return await suggestInstitutionPrefix({
      institutionLongName: input.institutionLongName,
      institutionShortName: input.institutionShortName,
      emailDomain: input.emailDomain,
    });
  });

export const administratorCourseRequestsRouter = t.router({
  checkInstructorLegitimacy: checkInstructorLegitimacyProcedure,
  selectInstitutionPrefix: selectInstitutionPrefixProcedure,
  suggestInstitutionPrefix: suggestInstitutionPrefixProcedure,
  deny,
  updateNote,
  createCourse,
});
