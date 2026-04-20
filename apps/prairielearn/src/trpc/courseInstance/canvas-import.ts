import { z } from 'zod';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type CanvasImportAssessmentData, CanvasImportEditor } from '../../lib/editors.js';

import { requireCoursePermissionEdit, t } from './init.js';

const sql = loadSqlEquiv(import.meta.url);

export interface CanvasImportError {
  Create: { code: 'IMPORT_JOB_FAILED'; jobSequenceId: string };
}

const QuestionDataSchema = z.object({
  directoryName: z.string().min(1),
  infoJson: z.record(z.unknown()),
  questionHtml: z.string(),
  serverPy: z.string().optional(),
  clientFiles: z.record(z.string()),
});

const AssessmentDataSchema = z.object({
  directoryName: z.string().min(1),
  infoJson: z.record(z.unknown()),
  rubricJson: z.record(z.unknown()).optional(),
  questions: z.array(QuestionDataSchema),
});

const create = t.procedure
  .use(requireCoursePermissionEdit)
  .input(
    z.object({
      assessments: z.array(AssessmentDataSchema).min(1),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const assessments: CanvasImportAssessmentData[] = input.assessments;

    const editor = new CanvasImportEditor({
      locals: ctx.locals,
      assessments,
    });

    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      return { jobSequenceId: serverJob.jobSequenceId, assessmentIds: [] };
    }

    // Look up the created assessment IDs by their UUIDs.
    const assessmentIds: string[] = [];
    for (const assessment of input.assessments) {
      const uuid = assessment.infoJson.uuid;
      if (typeof uuid === 'string') {
        try {
          const id = await queryScalar(
            sql.select_assessment_id_from_uuid,
            {
              uuid,
              course_instance_id: ctx.course_instance.id,
            },
            IdSchema,
          );
          assessmentIds.push(id);
        } catch {
          // Assessment may not have synced correctly; skip it.
        }
      }
    }

    return { jobSequenceId: serverJob.jobSequenceId, assessmentIds };
  });

export const canvasImportRouter = t.router({
  create,
});
