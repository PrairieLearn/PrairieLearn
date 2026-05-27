import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { type StaffCourse, StaffCourseSchema } from '../../lib/client/safe-db-types.js';
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
import {
  type GithubOrgAccessResult,
  checkGithubOrgAccess,
  checkGithubRepositoryExists,
  isPlatformDefaultOrg,
} from '../../lib/github.js';
import {
  selectOptionalCourseByPath,
  selectOptionalCourseByRepositoryName,
} from '../../models/course.js';
import { throwAppError } from '../app-errors.js';

import { normalizeCoursePathInput } from './course-path.js';
import { requireAdministrator, t } from './init.js';

const NullableStaffCourseSchema = StaffCourseSchema.nullable();

export interface AdminCourseRequestError {
  Deny: never;
  UpdateNote: never;
  CreateCourse: {
    code: 'CONFLICTS';
    repoCourse: StaffCourse | null;
    githubRepoUrl: string | null;
    pathCourse: StaffCourse | null;
  };
}

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
      // No format validation — admins may need to deviate from the standard
      // "RUBRIC NUMBER" pattern for non-standard department codes.
      shortName: z.string().min(1, 'Short name is required'),
      title: z.string().min(1, 'Title is required').max(75, 'Title must be at most 75 characters'),
      institutionId: IdSchema,
      displayTimezone: z.string().min(1, 'Timezone is required'),
      path: z.string().min(1, 'Path is required'),
      repoShortName: z.string().min(1, 'Repository name is required'),
      githubCourseOwner: z.string().min(1, 'GitHub organization is required'),
      githubUser: z.string(),
    }),
  )
  .output(z.object({ jobSequenceId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const normalizedPath = normalizeCoursePathInput(input.path);

    if (!isPlatformDefaultOrg(input.githubCourseOwner)) {
      const access = await checkGithubOrgAccess(input.githubCourseOwner);
      if (!access.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: githubOrgAccessErrorMessage(access, input.githubCourseOwner),
        });
      }
    }

    const [repoCourse, githubRepoExists, pathCourse] = await Promise.all([
      selectOptionalCourseByRepositoryName(input.repoShortName),
      checkGithubRepositoryExists(input.repoShortName, input.githubCourseOwner),
      selectOptionalCourseByPath(normalizedPath),
    ]);

    if (repoCourse != null || githubRepoExists || pathCourse != null) {
      throwAppError<AdminCourseRequestError['CreateCourse']>(
        {
          code: 'CONFLICTS',
          message: 'Conflicts detected with existing courses or repositories.',
          repoCourse: NullableStaffCourseSchema.parse(repoCourse),
          githubRepoUrl: githubRepoExists
            ? `https://github.com/${input.githubCourseOwner}/${input.repoShortName}`
            : null,
          pathCourse: NullableStaffCourseSchema.parse(pathCourse),
        },
        'CONFLICT',
      );
    }

    const jobSequenceId = await createCourseFromRequest({
      courseRequestId: input.courseRequestId,
      shortName: input.shortName,
      title: input.title,
      institutionId: input.institutionId,
      displayTimezone: input.displayTimezone,
      path: normalizedPath,
      repoShortName: input.repoShortName,
      githubCourseOwner: input.githubCourseOwner,
      githubUser: input.githubUser.trim().length > 0 ? input.githubUser.trim() : null,
      authnUser: ctx.authn_user,
    });
    return { jobSequenceId };
  });

function githubOrgAccessErrorMessage(
  result: Extract<GithubOrgAccessResult, { ok: false }>,
  org: string,
): string {
  switch (result.reason) {
    case 'no_client':
      return 'GitHub integration is not configured on this server.';
    case 'no_machine_user':
      return 'GitHub machine user is not configured; cannot validate org access.';
    case 'org_unreachable':
      return `Could not access GitHub organization '${org}'. Confirm the org exists and the machine account has been invited.`;
    case 'not_a_member':
      if (result.detail === 'pending') {
        return `The PrairieLearn machine account has not yet accepted the invitation to '${org}'. Accept the invitation and try again.`;
      }
      return `The PrairieLearn machine account is not a member of '${org}'. Add the account to the org and try again.`;
  }
}

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
