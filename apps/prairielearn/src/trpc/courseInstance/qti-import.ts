import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { flash } from '@prairielearn/flash';

import {
  type QtiImportAssessmentData,
  QtiImportEditor,
  type QtiImportQuestionData,
} from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { readQtiImportDraft } from '../../lib/qti-import-drafts.js';
import { SHORT_NAME_REGEX } from '../../lib/short-name.js';
import { AssessmentJsonSchema } from '../../schemas/infoAssessment.js';
import { QuestionJsonSchema } from '../../schemas/infoQuestion.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, t } from './init.js';

const QTI_IMPORT_DRAFT_UNAVAILABLE_MESSAGE =
  'The uploaded course content files are no longer available. Restart the import process and upload the export again.';

const SafeDirectoryName = z
  .string()
  .min(1)
  .regex(SHORT_NAME_REGEX, 'Directory name contains invalid characters');

/**
 * Validates an info JSON blob against the given schema without rewriting it.
 * Parsing directly with the schema would fill in every `.default()` value,
 * and those defaults would then be written verbatim into the imported
 * info.json files. Validate for correctness but keep the original input so
 * only the properties the client actually sent are written to disk.
 */
function validatedInfoJsonSchema(schema: z.ZodType) {
  return z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
    const result = schema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        // Spread into a fresh object: $ZodIssue is not assignable to
        // addIssue's raw issue parameter type.
        ctx.addIssue({ ...issue });
      }
    }
  });
}

const QuestionInfoJsonSchema = validatedInfoJsonSchema(QuestionJsonSchema.loose());
const AssessmentInfoJsonSchema = validatedInfoJsonSchema(AssessmentJsonSchema.loose());

const BaseQuestionDataSchema = z.object({
  directoryName: SafeDirectoryName,
  infoJson: QuestionInfoJsonSchema,
  overwrite: z.boolean().optional(),
});

const InlineQuestionDataSchema = BaseQuestionDataSchema.extend({
  questionHtml: z.string(),
  serverPy: z.string().optional(),
  clientFiles: z.record(z.string(), z.string()),
});

const DraftQuestionDataSchema = BaseQuestionDataSchema.extend({
  originalDirectoryName: SafeDirectoryName.optional(),
  draftId: z.uuid(),
});

const QuestionDataSchema = z.union([InlineQuestionDataSchema, DraftQuestionDataSchema]);
type QuestionData = z.infer<typeof QuestionDataSchema>;

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
  clientFiles: z.record(z.string(), z.string()),
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

    const hydrateQuestion = async (question: QuestionData): Promise<QtiImportQuestionData> => {
      if (!('draftId' in question)) {
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

    const assessmentCount = assessments.length;
    const questionCount = questions.length;
    const parts: string[] = [];
    if (assessmentCount > 0) {
      parts.push(`${assessmentCount} assessment${assessmentCount !== 1 ? 's' : ''}`);
    }
    if (questionCount > 0) {
      parts.push(`${questionCount} question${questionCount !== 1 ? 's' : ''}`);
    }
    if (parts.length > 0) {
      // The client unconditionally leaves the import flow after a successful mutation, so this
      // message is intended for the page it redirects to.
      flash('success', `${parts.join(' and ')} imported successfully.`);
    }
  });

export const qtiImportRouter = t.router({
  create,
});
