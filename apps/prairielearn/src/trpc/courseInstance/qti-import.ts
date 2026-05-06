import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryScalars } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type QtiImportAssessmentData, QtiImportEditor } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { SHORT_NAME_REGEX } from '../../lib/short-name.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, t } from './init.js';

const sql = loadSqlEquiv(import.meta.url);

const SafeDirectoryName = z
  .string()
  .min(1)
  .regex(SHORT_NAME_REGEX, 'Directory name contains invalid characters');

const QuestionDataSchema = z.object({
  directoryName: SafeDirectoryName,
  infoJson: z.object({ uuid: z.string().uuid(), title: z.string() }).passthrough(),
  questionHtml: z.string(),
  serverPy: z.string().optional(),
  clientFiles: z.record(z.string()),
  overwrite: z.boolean().optional(),
});

const AssessmentDataSchema = z.object({
  directoryName: SafeDirectoryName,
  infoJson: z.object({ uuid: z.string().uuid(), title: z.string() }).passthrough(),
  questions: z.array(QuestionDataSchema),
});

const requireQtiImportEnabled = t.middleware(async (opts) => {
  const enabled = await features.enabledFromLocals('qti-content-import', opts.ctx.locals);
  if (!enabled) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'QTI content import is not enabled for this course',
    });
  }
  return opts.next();
});

interface QtiImportError {
  Create: { code: 'SYNC_JOB_FAILED'; message: string; jobSequenceId: string };
}

const create = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireQtiImportEnabled)
  .input(
    z.object({
      assessments: z.array(AssessmentDataSchema).min(1),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const assessments: QtiImportAssessmentData[] = input.assessments;

    const editor = new QtiImportEditor({
      locals: ctx.locals,
      assessments,
    });

    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<QtiImportError['Create']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to import assessments',
        jobSequenceId: serverJob.jobSequenceId,
      });
    }

    // Look up the created assessment IDs by their UUIDs.
    const uuids = input.assessments.map((a) => a.infoJson.uuid);
    const assessmentIds = await queryScalars(
      sql.select_assessment_ids_from_uuids,
      {
        uuids,
        course_instance_id: ctx.course_instance.id,
      },
      IdSchema,
    );

    const count = assessmentIds.length;
    const expected = input.assessments.length;
    if (count > 0) {
      const warning = count < expected ? ` (${expected - count} failed to sync)` : '';
      flash(
        'success',
        `${count} assessment${count !== 1 ? 's' : ''} imported successfully.${warning}`,
      );
    }

    return { jobSequenceId: serverJob.jobSequenceId, assessmentIds };
  });

export const qtiImportRouter = t.router({
  create,
});
