import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';

import { config } from '../../lib/config.js';
import {
  GITHUB_USERNAME_VALIDATION_MESSAGE,
  isValidGithubUsername,
  parseGithubRepository,
} from '../../lib/github-utils.js';
import { addGithubRepositoryAdmin } from '../../lib/github.js';
import { isEnterprise } from '../../lib/license.js';

import { requireCoursePermissionOwn, requireNotExampleCourse, t } from './init.js';

export interface GithubAccessError {
  Grant: never;
}

export const githubAccessRouter = t.router({
  grant: t.procedure
    .use(requireCoursePermissionOwn)
    .use(requireNotExampleCourse)
    .input(
      z.object({
        username: z
          .string()
          .trim()
          .refine(isValidGithubUsername, GITHUB_USERNAME_VALIDATION_MESSAGE),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isEnterprise()) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Granting GitHub access requires PrairieLearn Enterprise Edition.',
        });
      }
      const repository = parseGithubRepository(ctx.course.repository ?? '');
      if (repository?.owner.toLowerCase() !== 'prairielearn') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'PrairieLearn can only grant access to repositories in the PrairieLearn organization on github.com.',
        });
      }
      if (config.githubClientToken === null) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'GitHub access cannot be granted on this server. Please contact support.',
        });
      }

      let result: Awaited<ReturnType<typeof addGithubRepositoryAdmin>>;
      try {
        result = await addGithubRepositoryAdmin(repository.owner, repository.repo, input.username);
      } catch (cause) {
        const status = cause instanceof Error && 'status' in cause ? cause.status : undefined;
        if (status === 404 || status === 422) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'GitHub could not grant access. Check the username and try again. If it is correct, contact support for help with repository access or organization restrictions.',
            cause,
          });
        }
        if (status === 403) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'GitHub refused the access request. Please contact support for help with repository permissions or invitation limits.',
            cause,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'Unable to grant GitHub access right now. Please try again later or contact support.',
          cause,
        });
      }

      logger.info('Granted course GitHub repository admin access', {
        course_id: ctx.course.id,
        authn_user_id: ctx.authz_data.authn_user.id,
        user_id: ctx.authz_data.user.id,
        ...repository,
        github_username: input.username,
        invited: result.invited,
      });
      return { username: input.username, invited: result.invited };
    }),
});
