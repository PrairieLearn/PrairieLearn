import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  checkInstructorLegitimacy,
  suggestPrefixFromEmailDomain,
} from '../../lib/course-request-ai.js';
import {
  createCourseFromRequest,
  denyCourseRequest,
  selectCourseRequestForAi,
  selectInstitutionPrefix,
  updateCourseRequestNote,
} from '../../lib/course-request.js';
import { coursePathAvailability, courseRepositoryAvailability } from '../../lib/course.js';

import { requireAdministrator, t } from './trpc-init.js';

const denyCourseRequestMutation = t.procedure
  .use(requireAdministrator)
  .input(z.object({ courseRequestId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    await denyCourseRequest({
      courseRequestId: input.courseRequestId,
      authnUser: ctx.authn_user,
    });
  });

const updateCourseRequestNoteMutation = t.procedure
  .use(requireAdministrator)
  .input(z.object({ courseRequestId: z.string(), note: z.string() }))
  .mutation(async ({ input }) => {
    await updateCourseRequestNote({
      courseRequestId: input.courseRequestId,
      note: input.note,
    });
  });

const createCourseMutation = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      courseRequestId: z.string().min(1),
      shortName: z.string().min(1, 'Short name is required'),
      title: z.string().min(1, 'Title is required'),
      institutionId: z.string().min(1, 'Institution is required'),
      displayTimezone: z.string().min(1, 'Timezone is required'),
      path: z.string().min(1, 'Path is required'),
      repoShortName: z.string().min(1, 'Repository name is required'),
      githubUser: z.string(),
    }),
  )
  .output(z.object({ jobSequenceId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const repoExists = await courseRepositoryAvailability(input.repoShortName);
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

    const jobSequenceId = await createCourseFromRequest({
      courseRequestId: input.courseRequestId,
      shortName: input.shortName,
      title: input.title,
      institutionId: input.institutionId,
      displayTimezone: input.displayTimezone,
      path: input.path,
      repoShortName: input.repoShortName,
      githubUser: input.githubUser.trim().length > 0 ? input.githubUser.trim() : null,
      authnUser: ctx.authn_user,
    });
    return { jobSequenceId };
  });

const checkInstructorLegitimacyQuery = t.procedure
  .use(requireAdministrator)
  .input(z.object({ courseRequestId: z.string() }))
  .output(
    z.object({
      isLikely: z.boolean(),
      confidence: z.enum(['high', 'medium', 'low']),
      summary: z.string(),
      sources: z.array(z.object({ url: z.string(), title: z.string().optional() })),
    }),
  )
  .query(async ({ input }) => {
    const courseRequest = await selectCourseRequestForAi({
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

const selectInstitutionPrefixQuery = t.procedure
  .use(requireAdministrator)
  .input(z.object({ institutionId: z.string() }))
  .output(
    z.object({
      prefix: z.string().nullable(),
    }),
  )
  .query(async ({ input }) => {
    const row = await selectInstitutionPrefix({ institutionId: input.institutionId });
    return { prefix: row?.prefix ?? null };
  });

const suggestPrefixFromEmailQuery = t.procedure
  .use(requireAdministrator)
  .input(z.object({ institutionName: z.string(), emailDomain: z.string() }))
  .output(
    z.object({
      prefix: z.string(),
      reasoning: z.string(),
      sources: z.array(z.object({ url: z.string(), title: z.string().optional() })),
    }),
  )
  .query(async ({ input }) => {
    return await suggestPrefixFromEmailDomain({
      emailDomain: input.emailDomain,
      institutionName: input.institutionName,
    });
  });

export const administratorCourseRequestsRouter = t.router({
  denyCourseRequestMutation,
  updateCourseRequestNoteMutation,
  createCourseMutation,
  checkInstructorLegitimacyQuery,
  selectInstitutionPrefixQuery,
  suggestPrefixFromEmailQuery,
});
