import { z } from 'zod';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type QtiImportAssessmentData, QtiImportEditor } from '../../lib/editors.js';

import { requireCoursePermissionEdit, t } from './init.js';

const sql = loadSqlEquiv(import.meta.url);

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
    const assessments: QtiImportAssessmentData[] = input.assessments;

    const editor = new QtiImportEditor({
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

export const qtiImportRouter = t.router({
  create,
});
