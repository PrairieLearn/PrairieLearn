import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { config } from '../../lib/config.js';
import {
  type UploadedCsvFile,
  uploadAssessmentInstanceScores,
  uploadInstanceQuestionScores,
} from '../../lib/score-upload.js';
import { uploadSubmissions } from '../../lib/submissions-upload.js';

import { requireCourseInstancePermissionEdit, t } from './init.js';

export interface AssessmentUploadsError {
  instanceQuestionScores: never;
  assessmentInstanceScores: never;
  submissions: never;
}

/**
 * Reads the uploaded CSV file out of the `FormData` body. Uploads are sent over
 * tRPC as `multipart/form-data` rather than JSON, so the file arrives as a
 * `File` under the `file` key.
 */
async function readCsvFile(input: FormData): Promise<UploadedCsvFile> {
  const file = input.get('file');
  if (!(file instanceof File)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'No CSV file uploaded' });
  }
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    originalname: file.name,
    size: file.size,
  };
}

const instanceQuestionScores = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(z.instanceof(FormData))
  .mutation(async ({ input, ctx }) => {
    const jobSequenceId = await uploadInstanceQuestionScores(
      ctx.assessment,
      await readCsvFile(input),
      ctx.locals.user.id,
      ctx.authn_user.id,
    );
    return { jobSequenceId };
  });

const assessmentInstanceScores = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(z.instanceof(FormData))
  .mutation(async ({ input, ctx }) => {
    const jobSequenceId = await uploadAssessmentInstanceScores(
      ctx.assessment.id,
      await readCsvFile(input),
      ctx.locals.user.id,
      ctx.authn_user.id,
    );
    return { jobSequenceId };
  });

const submissions = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(z.instanceof(FormData))
  .mutation(async ({ input, ctx }) => {
    if (!config.devMode) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Submission uploads are only allowed in dev mode',
      });
    }
    const jobSequenceId = await uploadSubmissions(
      ctx.assessment,
      await readCsvFile(input),
      ctx.locals.user.id,
      ctx.authn_user.id,
    );
    return { jobSequenceId };
  });

export const assessmentUploadsRouter = t.router({
  instanceQuestionScores,
  assessmentInstanceScores,
  submissions,
});
