import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { features } from '../../lib/features/index.js';
import { promoteUnsavedSubmission } from '../../lib/unsaved-submissions.js';
import { getClientFingerprintId } from '../../middlewares/clientFingerprint.js';

import { requireCourseInstancePermissionEdit, t } from './init.js';

export interface UnsavedSubmissionsError {
  promote: never;
}

const promote = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(z.object({ unsaved_submission_id: IdSchema, revision: z.string() }))
  .mutation(async ({ input, ctx }) => {
    if (
      !(await features.enabledFromLocals('unsaved-submissions-ui', ctx.locals)) ||
      !(await features.enabledFromLocals('unsaved-submissions-instructor-promotion', ctx.locals))
    ) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Unsaved submissions are not available' });
    }
    return await promoteUnsavedSubmission({
      ...input,
      assessment_id: ctx.assessment.id,
      course: ctx.course,
      authn_user_id: ctx.authn_user.id,
      mode: ctx.authz_data.mode,
      client_fingerprint_id: await getClientFingerprintId(ctx.req, ctx.res),
    });
  });

export const unsavedSubmissionsRouter = t.router({ promote });
