import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import {
  MAX_COVER_FILES,
  MAX_PACKET_PAGES,
  MAX_PRINT_FORMS,
} from '../../lib/client/printing/print-packet.js';
import { printLayoutSearch } from '../../lib/client/printing/print-preparation.js';
import { STALE_PRINT_SNAPSHOT_MESSAGE } from '../../lib/client/printing/print-snapshot.js';
import { getAssessmentUrl, getPrintFormUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import type { PrintForm } from '../../lib/db-types.js';
import {
  PRINT_DOCUMENTS,
  type PrintDocument,
  assertPrintDocumentReady,
  getPrintableFormQuestions,
} from '../../lib/printing/index.js';
import { checkPrintCovers, uploadPrintCover } from '../../lib/printing/print-covers.js';
import type { PrintExportWork } from '../../lib/printing/print-export-render.js';
import { printExportResult, queuePrintExport } from '../../lib/printing/print-exports.js';
import { PrintPacketError } from '../../lib/printing/print-packet.js';
import { PRINT_PAPER_SIZES_MISMATCH_MESSAGE } from '../../lib/printing/print-settings.js';
import {
  printSnapshotLayout,
  selectOptionalPrintSnapshotSummary,
} from '../../lib/printing/print-snapshots.js';
import { assessmentFilenamePrefix, sanitizeString } from '../../lib/sanitize-name.js';
import {
  selectOptionalPrintExport,
  selectRecentPrintExportsForAssessment,
} from '../../models/print-export.js';
import { selectPrintFormQuestionViability } from '../../models/print-form-question.js';
import { selectPrintFormsForAssessment } from '../../models/print-form.js';

import {
  type TRPCContext,
  requireCoursePermissionEdit,
  requireCoursePermissionPreview,
  t,
} from './init.js';
import { requirePrintingAvailable } from './print-forms.js';

export interface PrintExportsError {
  docx: never;
  list: never;
  pdf: never;
  preflight: never;
  status: never;
  uploadCover: never;
}

const PdfExportSchema = z.object({
  printFormIds: z
    .array(IdSchema)
    .min(1)
    .max(MAX_PRINT_FORMS)
    .refine((ids) => new Set(ids).size === ids.length, 'Select each print form only once.'),
  document: z.enum(PRINT_DOCUMENTS),
  coverIds: z.array(z.string()).max(MAX_COVER_FILES),
});

interface PreflightResult {
  /** Pages in the longest stored form plus uploaded covers. */
  pageCount: number;
  /** Forms without a current stored preview, which the page renders before checking again. */
  unpreparedFormIds: string[];
  failure: { printFormId: string; formLabel: string; message: string } | null;
}

/** Answer keys never include uploaded covers; student copies include all of them. */
function checkExportCovers(
  ctx: TRPCContext,
  { document, coverIds }: z.infer<typeof PdfExportSchema>,
) {
  if (document === 'answer_key' && coverIds.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Answer key exports do not use uploaded cover pages.',
    });
  }
  return checkPrintCovers(coverIds, {
    assessmentId: ctx.assessment.id,
    authnUserId: ctx.authn_user.id,
  });
}

function assertSharedPaperSize(forms: { settings: { paperSize: string } }[]) {
  if (
    forms.length > 1 &&
    forms.some((form) => form.settings.paperSize !== forms[0].settings.paperSize)
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: PRINT_PAPER_SIZES_MISMATCH_MESSAGE,
    });
  }
}

/** Loads the requested forms; combined exports may not include archived forms. */
async function selectExportForms(ctx: TRPCContext, printFormIds: string[]): Promise<PrintForm[]> {
  const savedForms = await selectPrintFormsForAssessment({ assessmentId: ctx.assessment.id });
  const formsById = new Map(savedForms.map((form) => [form.id, form]));
  return printFormIds.map((id) => {
    const saved = formsById.get(id);
    if (!saved || (printFormIds.length > 1 && saved.archived_at)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'A print form is not available.' });
    }
    return saved;
  });
}

/**
 * Finds the requesting user's stored preview of a form with its saved settings and current
 * questions. Any change since the preview gives a different key, so it reads as missing.
 */
async function findFormSnapshot(ctx: TRPCContext, form: PrintForm, document: PrintDocument) {
  const { printFormQuestionIds, questionListDigest } = await getPrintableFormQuestions(
    form.id,
    new Map(
      Object.entries(form.settings.questionSizes).flatMap(([number, size]) =>
        size ? [[number, size] as const] : [],
      ),
    ),
    new Set(form.settings.excludedQuestions),
  );
  const search = new URLSearchParams(printLayoutSearch(form.settings));
  const stored = await selectOptionalPrintSnapshotSummary({
    printForm: form,
    courseCommitHash: ctx.course.commit_hash,
    document,
    authnUserId: ctx.authn_user.id,
    userId: ctx.locals.user.id,
    layout: printSnapshotLayout(search),
    questionListDigest,
  });
  if (!stored) return null;
  search.set('document', document);
  const localPreviewUrl = new URL(
    `${getPrintFormUrl({ courseInstanceId: ctx.course_instance.id, assessmentId: ctx.assessment.id, printFormId: form.id })}/preview?${search}`,
    `${config.serverType}://localhost:${config.serverPort}`,
  );
  return {
    summary: stored.summary,
    questionListDigest,
    snapshot: {
      formLabel: form.label,
      printDocument: document,
      localPreviewUrl: localPreviewUrl.href,
      key: stored.key,
      assetScope: {
        courseInstanceId: ctx.course_instance.id,
        assessmentId: ctx.assessment.id,
        printFormId: form.id,
        printFormQuestionIds,
        authnUserId: ctx.authn_user.id,
        userId: ctx.locals.user.id,
      },
    },
  };
}

/** Finds each form's stored preview and rejects exports that would omit questions. */
async function findExportSnapshots(ctx: TRPCContext, forms: PrintForm[], document: PrintDocument) {
  const found = [];
  for (const form of forms) {
    const formSnapshot = await findFormSnapshot(ctx, form, document);
    if (!formSnapshot) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: STALE_PRINT_SNAPSHOT_MESSAGE });
    }
    assertPrintDocumentReady({
      questionCount: formSnapshot.summary.questionCount,
      omittedCount: formSnapshot.summary.omittedQuestionCount,
      // The worker checks that the questions start after the cover.
      coverPageCount: 0,
      document,
      formLabel: form.label,
    });
    found.push({ ...formSnapshot, form });
  }
  return found;
}

function exportOwner(ctx: TRPCContext) {
  return {
    assessmentId: ctx.assessment.id,
    authnUserId: ctx.authn_user.id,
    courseId: ctx.course.id,
    userId: ctx.locals.user.id,
  };
}

function formSelections(found: Awaited<ReturnType<typeof findExportSnapshots>>) {
  return found.map(({ form, questionListDigest }) => ({
    printFormId: form.id,
    excludedQuestions: form.settings.excludedQuestions,
    paperSize: form.settings.paperSize,
    questionListDigest,
  }));
}

/** Reports request and queueing errors to the client; anything else is unexpected. */
function exportError(error: unknown, message: string): TRPCError {
  if (error instanceof TRPCError) return error;
  if (error instanceof HttpStatusError && error.status === 429) {
    return new TRPCError({ code: 'TOO_MANY_REQUESTS', message: error.message, cause: error });
  }
  if (error instanceof HttpStatusError && error.status === 503) {
    return new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: error.message, cause: error });
  }
  if (
    error instanceof PrintPacketError ||
    (error instanceof HttpStatusError && error.status === 400)
  ) {
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message, cause: error });
}

export const printExportsRouter = t.router({
  /** Checks a combined PDF before it is queued. */
  preflight: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintingAvailable)
    .use(requireCoursePermissionEdit)
    .input(PdfExportSchema)
    .mutation(async ({ ctx, input }): Promise<PreflightResult> => {
      const { printFormIds: formIds, document } = input;
      const forms = await selectExportForms(ctx, formIds);
      assertSharedPaperSize(forms);
      const questions = await selectPrintFormQuestionViability(formIds);
      for (const form of forms) {
        const excluded = new Set(form.settings.excludedQuestions);
        const included = questions.filter(
          (question) =>
            question.print_form_id === form.id && !excluded.has(question.question_number),
        );
        const problem = included.find((question) => !question.supported || question.broken);
        if (included.length === 0 || problem) {
          return {
            pageCount: 0,
            unpreparedFormIds: [],
            failure: {
              printFormId: form.id,
              formLabel: form.label,
              message: problem
                ? `Question ${problem.question_number} in Form ${form.label} ${problem.broken ? 'has an error' : 'uses a question type that printing does not support'}. Review its preview before downloading.`
                : `Form ${form.label} has no selected questions. Include at least one question before downloading.`,
            },
          };
        }
      }
      try {
        const coverPageCount = checkExportCovers(ctx, input).reduce(
          (count, cover) => count + cover.pageCount,
          0,
        );
        const unpreparedFormIds: string[] = [];
        let formPageCount = 0;
        for (const form of forms) {
          const formSnapshot = await findFormSnapshot(ctx, form, document);
          if (!formSnapshot) {
            unpreparedFormIds.push(form.id);
          } else if (formSnapshot.summary.omittedQuestionCount > 0) {
            return {
              pageCount: 0,
              unpreparedFormIds: [],
              failure: {
                printFormId: form.id,
                formLabel: form.label,
                message: `Form ${form.label} has missing or unprintable questions. Review its preview before downloading.`,
              },
            };
          } else {
            formPageCount = Math.max(formPageCount, formSnapshot.summary.pageCount);
          }
        }
        return {
          pageCount: formPageCount + coverPageCount,
          unpreparedFormIds,
          failure: null,
        };
      } catch (error) {
        throw exportError(error, 'The forms could not be checked. Try again.');
      }
    }),
  pdf: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintingAvailable)
    .use(requireCoursePermissionEdit)
    .input(PdfExportSchema)
    .mutation(async ({ ctx, input }) => {
      const forms = await selectExportForms(ctx, input.printFormIds);
      assertSharedPaperSize(forms);
      try {
        const covers = checkExportCovers(ctx, input);
        const found = await findExportSnapshots(ctx, forms, input.document);
        const coverPageCount = covers.reduce((count, cover) => count + cover.pageCount, 0);
        const pageCount = Math.max(...found.map(({ summary }) => summary.pageCount));
        if ((pageCount + coverPageCount) * forms.length > MAX_PACKET_PAGES) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The export would exceed 10,000 pages. Reduce the number of forms.',
          });
        }
        const prefix = assessmentFilenamePrefix(
          ctx.assessment,
          ctx.locals.assessment_set,
          ctx.course_instance,
          ctx.course,
        );
        const documentName =
          input.document === 'assessment'
            ? forms.length === 1
              ? 'assessment'
              : 'all_forms'
            : forms.length === 1
              ? 'answer_key'
              : 'all_answer_keys';
        const formName = forms.length === 1 ? `form_${forms[0].label}_` : '';
        const work: PrintExportWork = {
          format: 'pdf',
          document: input.document,
          filename: `${prefix}${formName}${documentName}.pdf`,
          snapshots: found.map(({ snapshot }) => snapshot),
          covers: covers.map(({ name, key }) => ({ name, key })),
        };
        return {
          printExportId: await queuePrintExport({
            owner: exportOwner(ctx),
            work,
            formSelections: formSelections(found),
          }),
        };
      } catch (error) {
        throw exportError(
          error,
          'The PDF could not be prepared. Try again or contact support if this continues.',
        );
      }
    }),
  docx: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintingAvailable)
    .use(requireCoursePermissionEdit)
    .input(z.object({ printFormId: IdSchema, document: z.enum(PRINT_DOCUMENTS) }))
    .mutation(async ({ ctx, input }) => {
      const forms = await selectExportForms(ctx, [input.printFormId]);
      try {
        const found = await findExportSnapshots(ctx, forms, input.document);
        const [{ form, snapshot }] = found;
        const filename =
          assessmentFilenamePrefix(
            ctx.assessment,
            ctx.locals.assessment_set,
            ctx.course_instance,
            ctx.course,
          ) +
          sanitizeString(
            `form_${form.label}_${form.settings.paperSize.toLowerCase()}${
              input.document === 'answer_key' ? '_answer_key' : ''
            }`,
          ) +
          '.docx';
        return {
          printExportId: await queuePrintExport({
            owner: exportOwner(ctx),
            work: { format: 'docx', document: input.document, filename, snapshot },
            formSelections: formSelections(found),
          }),
        };
      } catch (error) {
        throw exportError(
          error,
          'The Word document could not be prepared. Try again or contact support if this continues.',
        );
      }
    }),
  /** Stores one cover PDF for later exports, so each export doesn't upload and parse it again. */
  uploadCover: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintingAvailable)
    .use(requireCoursePermissionEdit)
    .input(z.instanceof(FormData))
    .mutation(async ({ ctx, input }) => {
      const file = input.get('file');
      if (!(file instanceof File)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload cover pages as PDF files.' });
      }
      try {
        return await uploadPrintCover(file, {
          assessmentId: ctx.assessment.id,
          authnUserId: ctx.authn_user.id,
        });
      } catch (error) {
        throw exportError(error, 'The cover PDF could not be uploaded. Try again.');
      }
    }),
  list: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintingAvailable)
    .query(async ({ ctx }) => {
      const baseUrl = getAssessmentUrl({
        courseInstanceId: ctx.course_instance.id,
        assessmentId: ctx.assessment.id,
      });
      const exports = await selectRecentPrintExportsForAssessment({
        assessmentId: ctx.assessment.id,
        authnUserId: ctx.authn_user.id,
      });
      return exports.map((printExport) => {
        const { status, failureMessage } = printExportResult(printExport);
        return {
          id: printExport.id,
          createdAt: printExport.created_at,
          status,
          format: printExport.format,
          downloadUrl: status === 'succeeded' ? `${baseUrl}/print/exports/${printExport.id}` : null,
          sizeBytes: printExport.size_bytes,
          label: printExport.label,
          failureMessage,
        };
      });
    }),
  status: t.procedure
    .use(requireCoursePermissionPreview)
    .use(requirePrintingAvailable)
    .input(z.object({ printExportId: IdSchema }))
    .query(async ({ ctx, input }) => {
      const printExport = await selectOptionalPrintExport({
        printExportId: input.printExportId,
        assessmentId: ctx.assessment.id,
        authnUserId: ctx.authn_user.id,
      });
      if (!printExport) throw new TRPCError({ code: 'NOT_FOUND' });
      const { status, failureMessage } = printExportResult(printExport);
      return {
        status,
        format: printExport.format,
        downloadUrl:
          status === 'succeeded'
            ? `${getAssessmentUrl({ courseInstanceId: ctx.course_instance.id, assessmentId: ctx.assessment.id })}/print/exports/${printExport.id}`
            : null,
        sizeBytes: printExport.size_bytes,
        label: printExport.label,
        failureMessage,
      };
    }),
});
