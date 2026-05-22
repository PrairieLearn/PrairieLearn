import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { flash } from '@prairielearn/flash';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryScalars } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type QtiImportAssessmentData,
  QtiImportEditor,
  type QtiImportQuestionData,
} from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { deleteQtiImportDraft, readQtiImportDraft } from '../../lib/qti-import-drafts.js';
import { SHORT_NAME_REGEX } from '../../lib/short-name.js';
import { AssessmentJsonSchema } from '../../schemas/infoAssessment.js';
import { QuestionJsonSchema } from '../../schemas/infoQuestion.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, t } from './init.js';

const sql = loadSqlEquiv(import.meta.url);
const QTI_IMPORT_DRAFT_UNAVAILABLE_MESSAGE =
  'The uploaded course content files are no longer available. Restart the import process and upload the export again.';

const SafeDirectoryName = z
  .string()
  .min(1)
  .regex(SHORT_NAME_REGEX, 'Directory name contains invalid characters');

const QuestionInfoJsonSchema = QuestionJsonSchema.passthrough();
const AssessmentInfoJsonSchema = AssessmentJsonSchema.passthrough();

const QuestionDataSchema = z.object({
  directoryName: SafeDirectoryName,
  originalDirectoryName: SafeDirectoryName.optional(),
  draftId: z.string().uuid().optional(),
  infoJson: QuestionInfoJsonSchema,
  questionHtml: z.string().optional(),
  serverPy: z.string().optional(),
  clientFiles: z.record(z.string()).optional(),
  overwrite: z.boolean().optional(),
});

const AssessmentDataSchema = z.object({
  directoryName: SafeDirectoryName,
  infoJson: AssessmentInfoJsonSchema,
  questions: z.array(QuestionDataSchema),
});

const StoredSerializedQuestionOutputSchema = z.object({
  directoryName: SafeDirectoryName,
  sourceId: z.string(),
  infoJson: QuestionInfoJsonSchema,
  questionHtml: z.string(),
  serverPy: z.string().optional(),
  clientFiles: z.record(z.string()),
  skippedVideos: z.array(z.string()),
});

const StoredSerializedConversionResultForHydrationSchema = z.object({
  questions: z.array(StoredSerializedQuestionOutputSchema),
});
type StoredSerializedConversionResultForHydration = z.infer<
  typeof StoredSerializedConversionResultForHydrationSchema
>;

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

export interface QtiImportError {
  Create:
    | { code: 'QTI_IMPORT_DRAFT_UNAVAILABLE'; message: string }
    | { code: 'SYNC_JOB_FAILED'; message: string; jobSequenceId: string };
}

const create = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireQtiImportEnabled)
  .input(
    z
      .object({
        assessments: z.array(AssessmentDataSchema).default([]),
        questions: z.array(QuestionDataSchema).default([]),
      })
      .refine((data) => data.assessments.length > 0 || data.questions.length > 0, {
        message: 'At least one assessment or question must be included',
      }),
  )
  .mutation(async ({ input, ctx }) => {
    const draftCache = new Map<string, Promise<StoredSerializedConversionResultForHydration[]>>();
    const loadDraft = (draftId: string) => {
      let promise = draftCache.get(draftId);
      if (!promise) {
        promise = readQtiImportDraft({
          draftId,
          courseId: ctx.course.id,
          courseInstanceId: ctx.course_instance.id,
          userId: ctx.locals.authn_user.id,
        })
          .then((draft) =>
            z.array(StoredSerializedConversionResultForHydrationSchema).parse(draft.results),
          )
          .catch(() => {
            throwAppError<QtiImportError['Create']>({
              code: 'QTI_IMPORT_DRAFT_UNAVAILABLE',
              message: QTI_IMPORT_DRAFT_UNAVAILABLE_MESSAGE,
            });
          });
        draftCache.set(draftId, promise);
      }
      return promise;
    };

    const hydrateQuestion = async (
      question: z.infer<typeof QuestionDataSchema>,
    ): Promise<QtiImportQuestionData> => {
      if (!question.draftId) {
        if (!question.questionHtml || !question.clientFiles) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Question import data is missing generated files',
          });
        }
        return {
          directoryName: question.directoryName,
          infoJson: question.infoJson,
          questionHtml: question.questionHtml,
          serverPy: question.serverPy,
          clientFiles: question.clientFiles,
          overwrite: question.overwrite,
        };
      }

      const results = await loadDraft(question.draftId);
      const originalDirectoryName = question.originalDirectoryName ?? question.directoryName;
      const storedQuestion = results
        .flatMap((result) => result.questions)
        .find((q) => q.directoryName === originalDirectoryName);
      if (!storedQuestion) {
        throwAppError<QtiImportError['Create']>({
          code: 'QTI_IMPORT_DRAFT_UNAVAILABLE',
          message: QTI_IMPORT_DRAFT_UNAVAILABLE_MESSAGE,
        });
      }

      return {
        directoryName: question.directoryName,
        infoJson: question.infoJson,
        questionHtml: storedQuestion.questionHtml,
        serverPy: storedQuestion.serverPy,
        clientFiles: storedQuestion.clientFiles,
        overwrite: question.overwrite,
      };
    };

    const assessments: QtiImportAssessmentData[] = await Promise.all(
      input.assessments.map(async (assessment) => ({
        directoryName: assessment.directoryName,
        infoJson: assessment.infoJson,
        questions: await Promise.all(assessment.questions.map(hydrateQuestion)),
      })),
    );
    const questions = await Promise.all(input.questions.map(hydrateQuestion));

    const editor = new QtiImportEditor({
      locals: ctx.locals,
      assessments,
      questions,
    });

    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<QtiImportError['Create']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to import QTI content',
        jobSequenceId: serverJob.jobSequenceId,
      });
    }

    await Promise.all(
      [...draftCache.keys()].map(async (draftId) => {
        try {
          await deleteQtiImportDraft(draftId);
        } catch (err) {
          logger.warn('Failed to delete QTI import draft after successful import', {
            draftId,
            err,
          });
        }
      }),
    );

    // Look up the created assessment IDs by their UUIDs.
    const uuids = assessments.map((a) => a.infoJson.uuid);
    const assessmentIds = await queryScalars(
      sql.select_assessment_ids_from_uuids,
      {
        uuids,
        course_instance_id: ctx.course_instance.id,
      },
      IdSchema,
    );

    const assessmentCount = assessmentIds.length;
    const questionCount = questions.length;
    const parts: string[] = [];
    if (assessmentCount > 0) {
      parts.push(`${assessmentCount} assessment${assessmentCount !== 1 ? 's' : ''}`);
    }
    if (questionCount > 0) {
      parts.push(`${questionCount} question${questionCount !== 1 ? 's' : ''}`);
    }
    if (parts.length > 0) {
      flash('success', `${parts.join(' and ')} imported successfully.`);
    }

    return {
      jobSequenceId: serverJob.jobSequenceId,
      assessmentIds,
      questionCount: questions.length,
    };
  });

export const qtiImportRouter = t.router({
  create,
});
