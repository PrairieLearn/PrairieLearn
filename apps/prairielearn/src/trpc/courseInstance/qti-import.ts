import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type QtiImportAssessmentData, QtiImportEditor } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, t } from './init.js';

const sql = loadSqlEquiv(import.meta.url);

const SafeDirectoryName = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9._\-/]+$/, 'Directory name contains invalid characters')
  .refine((s) => !s.includes('..'), 'Directory name must not contain ".."');

const QuestionDataSchema = z.object({
  directoryName: SafeDirectoryName,
  infoJson: z.object({ uuid: z.string().uuid(), title: z.string() }).passthrough(),
  questionHtml: z.string(),
  serverPy: z.string().optional(),
  clientFiles: z.record(z.string()),
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
    const assessmentIds: string[] = [];
    for (const assessment of input.assessments) {
      try {
        const id = await queryScalar(
          sql.select_assessment_id_from_uuid,
          {
            uuid: assessment.infoJson.uuid,
            course_instance_id: ctx.course_instance.id,
          },
          IdSchema,
        );
        assessmentIds.push(id);
      } catch {
        // Assessment may not have synced correctly; skip it.
      }
    }

    const count = assessmentIds.length;
    if (count > 0) {
      flash('success', `${count} assessment${count !== 1 ? 's' : ''} imported successfully.`);
    }

    return { jobSequenceId: serverJob.jobSequenceId, assessmentIds };
  });

export const qtiImportRouter = t.router({
  create,
});
