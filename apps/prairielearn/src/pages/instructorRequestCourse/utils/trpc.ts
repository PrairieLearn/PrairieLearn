import * as path from 'path';

import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { config } from '../../../lib/config.js';
import {
  canAutoCreateCourse,
  checkExistingCourseRequest,
  getExistingOwnerCourseSettings,
  insertCourseRequest,
} from '../../../lib/course-request.js';
import * as github from '../../../lib/github.js';
import * as opsbot from '../../../lib/opsbot.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import * as zoho from '../../../lib/zoho.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'plain'>;
  return {
    authn_user: locals.authn_user,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const submitCourseRequest = t.procedure
  .input(
    z.object({
      shortName: z.string().min(1),
      title: z.string().min(1),
      // Optional field — user may not have a GitHub account
      githubUser: z.string().nullable(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      workEmail: z.string().min(1),
      institution: z.string().min(1),
      referralSource: z.string().min(1),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const shortName = input.shortName.toUpperCase();

    if (!/[A-Z]+ [A-Z0-9]+/.test(shortName)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'The course rubric and number should be a series of letters, followed by a space, followed by a series of numbers and/or letters.',
      });
    }

    const hasExistingCourseRequest = await checkExistingCourseRequest({
      userId: ctx.authn_user.id,
      shortName,
    });

    if (hasExistingCourseRequest) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'You already have a request for this course.',
      });
    }

    const courseRequestId = await insertCourseRequest({
      shortName,
      title: input.title,
      userId: ctx.authn_user.id,
      githubUser: input.githubUser,
      firstName: input.firstName,
      lastName: input.lastName,
      workEmail: input.workEmail,
      institution: input.institution,
      referralSource: input.referralSource,
    });

    zoho
      .sendCourseRequestLead({
        firstName: input.firstName,
        lastName: input.lastName,
        workEmail: input.workEmail,
        institution: input.institution,
        referralSource: input.referralSource,
        userUid: ctx.authn_user.uid,
        shortName,
        title: input.title,
        githubUser: input.githubUser,
        createdAt: new Date(),
      })
      .catch((err) => {
        logger.error('Error sending course request lead to Zoho', err);
        Sentry.captureException(err);
      });

    const autoApprove =
      config.courseRequestAutoApprovalEnabled &&
      (await canAutoCreateCourse({ userId: ctx.authn_user.id }));

    if (autoApprove) {
      // User has pre-existing course ownership — auto-create the repo and approve.
      const existingSettings = await getExistingOwnerCourseSettings({
        userId: ctx.authn_user.id,
      });
      const repoShortName = github.reponameFromShortname(shortName);
      await github.createCourseRepoJob(
        {
          short_name: shortName,
          title: input.title,
          institution_id: existingSettings.institution_id,
          display_timezone: existingSettings.display_timezone,
          path: path.join(config.coursesRoot, repoShortName),
          repo_short_name: repoShortName,
          github_user: input.githubUser,
          course_request_id: courseRequestId,
        },
        ctx.authn_user,
      );

      opsbot
        .sendCourseRequestMessage(
          '*Automatically creating course*\n' +
            `Course repo: ${repoShortName}\n` +
            `Course rubric: ${shortName}\n` +
            `Course title: ${input.title}\n` +
            `Requested by: ${input.firstName} ${input.lastName} (${input.workEmail})\n` +
            `Logged in as: ${ctx.authn_user.name} (${ctx.authn_user.uid})\n` +
            `GitHub username: ${input.githubUser ?? 'not provided'}`,
        )
        .catch((err) => {
          logger.error('Error sending course request message to Slack', err);
          Sentry.captureException(err);
        });

      return { autoApproved: true };
    } else {
      // Request needs manual review — notify Slack.
      opsbot
        .sendCourseRequestMessage(
          '*Incoming course request*\n' +
            `Course rubric: ${shortName}\n` +
            `Course title: ${input.title}\n` +
            `Requested by: ${input.firstName} ${input.lastName} (${input.workEmail})\n` +
            `Logged in as: ${ctx.authn_user.name} (${ctx.authn_user.uid})\n` +
            `GitHub username: ${input.githubUser ?? 'not provided'}`,
        )
        .catch((err) => {
          logger.error('Error sending course request message to Slack', err);
          Sentry.captureException(err);
        });

      return { autoApproved: false };
    }
  });

export const instructorRequestCourseRouter = t.router({ submitCourseRequest });
export type InstructorRequestCourseRouter = typeof instructorRequestCourseRouter;
