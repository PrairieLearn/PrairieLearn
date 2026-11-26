import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument } from 'pdf-lib';
import * as tmp from 'tmp-promise';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';
import * as PrairieMQ from '@prairielearn/prairiemq';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { getRuntimeDirectoryForCourse } from '../lib/chunks.js';
import { printFormLabelBase } from '../lib/client/printing/print-form-label.js';
import { printLayoutSearch } from '../lib/client/printing/print-preparation.js';
import { getAssessmentTrpcUrl, getPrintFormUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as printing from '../lib/printing/index.js';
import { digestPrintCoverHtml, getPrintCoverHtml } from '../lib/printing/print-cover.js';
import * as printExportRender from '../lib/printing/print-export-render.js';
import {
  beginPrintExportShutdown,
  initPrintExportWorker,
  queuePrintExport,
  waitForPrintExportWorkers,
} from '../lib/printing/print-exports.js';
import { createPrintForm } from '../lib/printing/print-forms.js';
import {
  assessmentHasPrintRandomization,
  selectPrintPreparationForms,
} from '../lib/printing/print-preparation.js';
import { DEFAULT_PRINT_SETTINGS } from '../lib/printing/print-settings.js';
import { createPrintSnapshotId } from '../lib/printing/print-snapshot-id.js';
import { RenderQueueFullError } from '../lib/printing/render-queue.js';
import { generateCsrfToken } from '../middlewares/csrfToken.js';
import { selectAssessmentById, selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { selectCourseById } from '../models/course.js';
import { insertPrintExport, selectOptionalPrintExport } from '../models/print-export.js';
import { selectPrintFormQuestions } from '../models/print-form-question.js';
import { lockPrintFormQuestionSelections, selectOptionalPrintForm } from '../models/print-form.js';
import { selectQuestionById } from '../models/question.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import { runInTransactionAndRollback } from './helperDb.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const sql = loadSqlEquiv(import.meta.url);

function client(assessmentId: string, authnUserId = '1') {
  return createAssessmentTrpcClient({
    courseInstanceId: '1',
    assessmentId,
    urlBase: siteUrl,
    csrfToken: generatePrefixCsrfToken(
      {
        url: getAssessmentTrpcUrl({ courseInstanceId: '1', assessmentId }),
        authn_user_id: authnUserId,
      },
      config.secretKey,
    ),
  });
}

function packetInput(printFormId: string, document: 'assessment' | 'answer_key' = 'assessment') {
  const data = new FormData();
  data.set(
    'metadata',
    JSON.stringify({
      forms: [{ printFormId }],
      document,
    }),
  );
  return data;
}

async function appendPrintSnapshot(
  data: FormData,
  printFormId: string,
  html: string,
  document: 'assessment' | 'answer_key' = 'assessment',
) {
  const search = new URLSearchParams(printLayoutSearch(DEFAULT_PRINT_SETTINGS));
  search.set('document', document);
  data.append('pages', new File([html], `form-${printFormId}.html`));
  data.append(
    'snapshotIds',
    createPrintSnapshotId(
      {
        printFormId,
        authnUserId: '1',
        search,
        questionListDigest: await printing.getPrintableQuestionListDigest(printFormId, new Set()),
        html,
        coverDigest: 'unused-by-pdf-exports',
        source: { html: '', figures: [] },
      },
      config.secretKey,
    ),
  );
}

async function printAssessment() {
  return await selectAssessmentByTid({
    course_instance_id: '1',
    tid: 'exam20-assessmentTools',
  });
}

describe('print preparation', { timeout: 60_000 }, () => {
  let courseDirectory: tmp.DirectoryResult;
  let printQueue: PrairieMQ.Queue;
  const originalQueuePrefix = config.printExportQueuePrefix;
  const testQueuePrefix = `test-print-exports-${randomUUID()}`;

  async function completePrintExport(
    assessmentId: string,
    printExportId: string,
    status: 'succeeded' | 'failed' = 'succeeded',
  ) {
    await printQueue.resume();
    await expect
      .poll(
        async () =>
          (
            await selectOptionalPrintExport({
              printExportId,
              assessmentId,
              authnUserId: '1',
            })
          )?.status,
        { timeout: 10_000 },
      )
      .toBe(status);
  }

  function startPrintExportWorker() {
    // Vitest hosts may not have a browser installed; these tests mock rendering.
    const available = vi.spyOn(printing, 'isBrowserRenderingAvailable').mockReturnValue(true);
    try {
      initPrintExportWorker();
    } finally {
      available.mockRestore();
    }
  }

  async function queueTestPdf(
    filename: string,
    formSelections: Parameters<typeof queuePrintExport>[0]['formSelections'] = [],
  ) {
    const assessment = await printAssessment();
    const courseInstance = await selectCourseInstanceById('1');
    const printExportId = await queuePrintExport({
      formSelections,
      owner: {
        assessmentId: assessment.id,
        authnUserId: '1',
        courseId: courseInstance.course_id,
        userId: '1',
      },
      work: {
        format: 'pdf',
        document: 'assessment',
        filename,
        snapshots: [],
        covers: [],
      },
    });
    return { assessment, printExportId };
  }

  beforeAll(async () => {
    config.printExportQueuePrefix = testQueuePrefix;
    printQueue = new PrairieMQ.Queue('print-exports', {
      redisUrl: config.nonVolatileRedisUrl!,
      prefix: testQueuePrefix,
    });
    await printQueue.pause();
    // File-error tests must not modify the course used by other test workers.
    courseDirectory = await tmp.dir({ unsafeCleanup: true });
    await fs.cp(TEST_COURSE_PATH, courseDirectory.path, { recursive: true });
    await helperServer.before(courseDirectory.path)();
    startPrintExportWorker();
    await features.enable('printable-assessments');
  });
  beforeEach(async () => {
    await printQueue.pause();
    await vi.waitUntil(async () => (await printQueue.getJobCounts()).active === 0, {
      timeout: 10_000,
    });
  });
  afterAll(async () => {
    try {
      await helperServer.after();
    } finally {
      await printQueue.obliterate();
      await printQueue.close();
      config.printExportQueuePrefix = originalQueuePrefix;
      await courseDirectory.cleanup();
    }
  });

  test('rejects print procedures while the feature is disabled', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    await features.disable('printable-assessments');
    try {
      await expect(api.printForms.list.query()).rejects.toMatchObject({
        data: { code: 'NOT_FOUND' },
      });
      await expect(api.printForms.create.mutate()).rejects.toMatchObject({
        data: { code: 'NOT_FOUND' },
      });
      await expect(api.printExports.pdf.mutate(packetInput('1'))).rejects.toMatchObject({
        data: { code: 'NOT_FOUND' },
      });
      await expect(api.printExports.status.query({ printExportId: '1' })).rejects.toMatchObject({
        data: { code: 'NOT_FOUND' },
      });
    } finally {
      await features.enable('printable-assessments');
    }
  });

  test.each(['exam20-assessmentTools', 'hw7-bonusPoints'])(
    'creates independent saved forms even when students only get one attempt (%s)',
    async (tid) => {
      const assessment = await selectAssessmentByTid({ course_instance_id: '1', tid });
      const api = client(assessment.id);
      expect(assessment.multiple_instance).toBe(false);
      const first = await api.printForms.ensureInitial.mutate();
      expect(await api.printForms.ensureInitial.mutate()).toEqual(first);
      await expect(api.printForms.archive.mutate(first)).rejects.toThrow(
        'The only current print form cannot be archived.',
      );
      const second = await api.printForms.create.mutate();
      expect(second.printFormId).not.toBe(first.printFormId);
      expect([first.label, second.label]).toEqual(['A1', 'B1']);
      expect(
        await selectOptionalPrintForm({
          printFormId: first.printFormId,
          assessmentId: assessment.id,
        }),
      ).toMatchObject({ user_id: '1', authn_user_id: '1' });
      expect((await selectAssessmentById(assessment.id)).multiple_instance).toBe(false);
      const forms = await api.printForms.list.query();
      expect(forms.slice(0, 2).map((form) => form.id)).toEqual([
        second.printFormId,
        first.printFormId,
      ]);
      expect(Object.keys(forms[0]).sort()).toEqual([
        'archived_at',
        'assessment_id',
        'created_at',
        'has_randomizable_questions',
        'id',
        'label',
        'question_selection_locked_at',
        'settings',
      ]);
      const questions = await api.printForms.questions.query(first);
      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].number).toBe(
        assessment.type === 'Homework' ? `HW${assessment.number}.1` : '1',
      );
      expect(questions.flatMap((question) => question.concerns)).not.toContain(
        'Could not check this question for printing issues. Review it in the preview before printing.',
      );
      await api.printForms.archive.mutate(first);
      expect((await api.printForms.ensureInitial.mutate()).printFormId).toBe(second.printFormId);
      await expect(api.printForms.archive.mutate(second)).rejects.toThrow(
        'The only current print form cannot be archived.',
      );
      expect(
        (await api.printForms.list.query()).find((form) => form.id === first.printFormId)
          ?.archived_at,
      ).not.toBeNull();
    },
  );

  test('rejects settings for questions that are not in the form', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.ensureInitial.mutate();
    await expect(
      api.printForms.updateSettings.mutate({
        printFormId: form.printFormId,
        settings: { ...form.settings, excludedQuestions: ['999'] },
        expectedSettings: form.settings,
      }),
    ).rejects.toThrow('refer to questions that are not in this form');
  });

  test('regeneration replaces a locked form and preserves the saved original', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const originalSettings = {
      ...DEFAULT_PRINT_SETTINGS,
      excludedQuestions: ['1'],
    };
    const first = await api.printForms.create.mutate({ settings: originalSettings });
    const original = await selectPrintFormQuestions(first.printFormId);
    const originalQuestions = await api.printForms.questions.query(first);
    expect(
      (await api.printForms.list.query()).find((form) => form.id === first.printFormId),
    ).toMatchObject({ settings: originalSettings });

    const updatedSettings = {
      ...originalSettings,
      questionSizes: { '2': 'half' as const },
    };
    await api.printForms.updateSettings.mutate({
      printFormId: first.printFormId,
      settings: updatedSettings,
      expectedSettings: originalSettings,
    });
    expect(
      (await api.printForms.list.query()).find((form) => form.id === first.printFormId),
    ).toMatchObject({ settings: updatedSettings });

    await lockPrintFormQuestionSelections({
      assessmentId: assessment.id,
      printFormIds: [first.printFormId],
    });
    const regenerated = await api.printForms.regenerate.mutate(first);
    expect(regenerated.printFormId).not.toBe(first.printFormId);
    expect(printFormLabelBase(regenerated.label)).toBe(printFormLabelBase(first.label));
    expect(regenerated.label).not.toBe(first.label);
    expect(await selectPrintFormQuestions(first.printFormId)).toEqual(original);
    expect(
      (await selectOptionalPrintForm({
        printFormId: first.printFormId,
        assessmentId: assessment.id,
      }))!.archived_at,
    ).not.toBeNull();
    expect(await api.printForms.questions.query(first)).toEqual(originalQuestions);
    expect(await api.printForms.questions.query(regenerated)).toHaveLength(
      originalQuestions.length,
    );
    const forms = await api.printForms.list.query();
    expect(forms.find((form) => form.id === regenerated.printFormId)?.settings).toEqual({
      ...updatedSettings,
      questionSizes: {},
      excludedQuestions: [],
    });
    expect(forms.find((form) => form.id === first.printFormId)?.settings).toEqual(updatedSettings);
    await expect(
      api.printForms.updateSettings.mutate({
        printFormId: first.printFormId,
        settings: originalSettings,
        expectedSettings: updatedSettings,
      }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
  });

  test('revises a locked question selection without changing the saved form', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const settings = {
      ...DEFAULT_PRINT_SETTINGS,
      questionSizes: { '2': 'half' as const },
      excludedQuestions: ['1'],
    };
    const original = await api.printForms.create.mutate({ settings });
    const originalQuestions = await selectPrintFormQuestions(original.printFormId);
    await lockPrintFormQuestionSelections({
      assessmentId: assessment.id,
      printFormIds: [original.printFormId],
    });

    await expect(
      api.printForms.reviseSelection.mutate({
        printFormId: original.printFormId,
        questionNumber: 'not-on-form',
        included: true,
      }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });

    const revised = await api.printForms.reviseSelection.mutate({
      printFormId: original.printFormId,
      questionNumber: '1',
      included: true,
    });
    expect(revised.printFormId).not.toBe(original.printFormId);
    expect(printFormLabelBase(revised.label)).toBe(printFormLabelBase(original.label));
    expect(revised.label).not.toBe(original.label);
    expect(revised.settings).toEqual({ ...settings, excludedQuestions: [] });

    const revisedQuestions = await selectPrintFormQuestions(revised.printFormId);
    const savedQuestionData = (rows: Awaited<ReturnType<typeof selectPrintFormQuestions>>) =>
      rows.map(({ print_form_question: question }) => ({
        assessment_question_id: question.assessment_question_id,
        position: question.position,
        question_number: question.question_number,
        max_points: question.max_points,
      }));
    expect(savedQuestionData(revisedQuestions)).toEqual(savedQuestionData(originalQuestions));
    const originalVariantIds = new Set(
      originalQuestions.map(({ print_form_question }) => print_form_question.variant_id),
    );
    expect(
      revisedQuestions.every(
        ({ print_form_question }) => !originalVariantIds.has(print_form_question.variant_id),
      ),
    ).toBe(true);
    const randomValues = async (printFormId: string) =>
      await queryRows(
        sql.select_print_form_variant_data,
        { print_form_id: printFormId },
        z.object({
          question_number: z.string(),
          variant_seed: z.string(),
          params: z.unknown(),
          true_answer: z.unknown(),
        }),
      );
    expect(await randomValues(revised.printFormId)).toEqual(
      await randomValues(original.printFormId),
    );
    expect(await selectPrintFormQuestions(original.printFormId)).toEqual(originalQuestions);
    expect(
      (await selectOptionalPrintForm({
        printFormId: original.printFormId,
        assessmentId: assessment.id,
      }))!.archived_at,
    ).not.toBeNull();
    await expect(
      api.printForms.reviseSelection.mutate({
        printFormId: original.printFormId,
        questionNumber: '1',
        included: true,
      }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
  });

  test('applies one paper size to current forms while retaining downloaded versions', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const originalSettings = {
      ...DEFAULT_PRINT_SETTINGS,
      blockSize: 'half' as const,
      excludedQuestions: ['1'],
    };
    const first = await api.printForms.create.mutate({ settings: originalSettings });
    const second = await api.printForms.create.mutate();
    await lockPrintFormQuestionSelections({
      assessmentId: assessment.id,
      printFormIds: [first.printFormId],
    });
    const variantSchema = z.object({
      assessment_question_id: IdSchema,
      position: z.number(),
      question_number: z.string(),
      max_points: z.number(),
      variant_id: IdSchema,
      variant_seed: z.string(),
      params: z.unknown(),
      true_answer: z.unknown(),
    });
    const firstVariants = await queryRows(
      sql.select_print_form_variant_data,
      { print_form_id: first.printFormId },
      variantSchema,
    );
    const expectedForms = (await api.printForms.list.query())
      .filter((form) => form.archived_at === null)
      .map((form) => ({
        id: form.id,
        paperSize: form.settings.paperSize,
        locked: form.question_selection_locked_at !== null,
      }));
    await expect(
      api.printForms.setPaperSize.mutate({
        printFormId: second.printFormId,
        paperSize: 'A4',
        expectedForms: expectedForms.map((form) =>
          form.id === first.printFormId ? { ...form, locked: false } : form,
        ),
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });

    const changed = await api.printForms.setPaperSize.mutate({
      printFormId: second.printFormId,
      paperSize: 'A4',
      expectedForms,
    });
    expect(changed.replacements).toHaveLength(1);
    const replacement = changed.replacements[0];
    expect(replacement.oldPrintFormId).toBe(first.printFormId);
    expect(replacement.label).toBe(`${printFormLabelBase(first.label)}2`);
    expect(replacement.settings).toEqual({ ...originalSettings, paperSize: 'A4' });

    const forms = await api.printForms.list.query();
    expect(forms.find((form) => form.id === first.printFormId)).toMatchObject({
      archived_at: expect.any(Date),
      settings: originalSettings,
    });
    expect(forms.find((form) => form.id === second.printFormId)).toMatchObject({
      archived_at: null,
      settings: { ...DEFAULT_PRINT_SETTINGS, paperSize: 'A4' },
    });
    expect(forms.find((form) => form.id === replacement.printFormId)).toMatchObject({
      archived_at: null,
      settings: replacement.settings,
    });
    const replacementVariants = await queryRows(
      sql.select_print_form_variant_data,
      { print_form_id: replacement.printFormId },
      variantSchema,
    );
    expect(replacementVariants.map(({ variant_id: _id, ...variant }) => variant)).toEqual(
      firstVariants.map(({ variant_id: _id, ...variant }) => variant),
    );
    expect(replacementVariants.map((variant) => variant.variant_id)).not.toEqual(
      firstVariants.map((variant) => variant.variant_id),
    );

    await expect(
      api.printForms.updateSettings.mutate({
        printFormId: second.printFormId,
        settings: DEFAULT_PRINT_SETTINGS,
        expectedSettings: { ...DEFAULT_PRINT_SETTINGS, paperSize: 'A4' },
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    const added = await api.printForms.create.mutate({
      settings: forms.find((form) => form.id === first.printFormId)!.settings,
    });
    expect(added.settings.paperSize).toBe('A4');
    await expect(
      queueTestPdf('stale-paper-size.pdf', [
        {
          printFormId: added.printFormId,
          excludedQuestions: added.settings.excludedQuestions,
          paperSize: 'Letter',
          questionListDigest: await printing.getPrintableQuestionListDigest(
            added.printFormId,
            new Set(added.settings.excludedQuestions),
          ),
        },
      ]),
    ).rejects.toThrow('This print preview has expired or changed.');
    // Other tests use the same assessment, so restore its current forms to the default size.
    const currentForms = (await api.printForms.list.query()).filter(
      (form) => form.archived_at === null,
    );
    await api.printForms.setPaperSize.mutate({
      printFormId: added.printFormId,
      paperSize: 'Letter',
      expectedForms: currentForms.map((form) => ({
        id: form.id,
        paperSize: form.settings.paperSize,
        locked: form.question_selection_locked_at !== null,
      })),
    });
  });

  test('shares forms across staff while keeping assessment boundaries', async () => {
    const assessment = await printAssessment();
    const otherAssessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam23-printing',
    });
    const otherUser = await getOrCreateUser({
      uid: 'print-collaborator@example.com',
      name: 'Print collaborator',
      uin: '555555555',
      email: 'print-collaborator@example.com',
    });
    const courseInstance = await selectCourseInstanceById('1');
    await insertCoursePermissionsByUserUid({
      course_id: courseInstance.course_id,
      uid: otherUser.uid,
      course_role: 'Owner',
      authn_user_id: '1',
    });
    const api = client(assessment.id);
    await api.printForms.create.mutate();
    const otherUserForm = await createPrintForm({
      assessment,
      course: await selectCourseById(courseInstance.course_id),
      courseInstance,
      userId: otherUser.id,
      authnUserId: '1',
    });
    expect((await api.printForms.list.query()).some((form) => form.id === otherUserForm.id)).toBe(
      true,
    );
    expect(
      (await api.printForms.questions.query({ printFormId: otherUserForm.id })).length,
    ).toBeGreaterThan(0);
    await api.printForms.archive.mutate({ printFormId: otherUserForm.id });
    expect(
      (await api.printForms.list.query()).find((form) => form.id === otherUserForm.id)!.archived_at,
    ).not.toBeNull();
    expect(
      (await api.printForms.questions.query({ printFormId: otherUserForm.id })).length,
    ).toBeGreaterThan(0);
    await expect(
      api.printForms.regenerate.mutate({ printFormId: otherUserForm.id }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    await expect(api.printExports.pdf.mutate(packetInput(otherUserForm.id))).rejects.toThrow(
      'The preview pages are incomplete. Update the preview and try again.',
    );
    const otherAssessmentApi = client(otherAssessment.id);
    const otherForm = await otherAssessmentApi.printForms.create.mutate();
    expect(otherForm.label).toBe('A1');
    await expect(otherAssessmentApi.printForms.archive.mutate(otherForm)).rejects.toThrow(
      'The only current print form cannot be archived.',
    );
    await expect(api.printForms.questions.query(otherForm)).rejects.toThrow(
      'This print form is not available.',
    );
    await expect(api.printForms.regenerate.mutate(otherForm)).rejects.toThrow(
      'This print form is not available.',
    );
    await expect(
      api.printForms.updateSettings.mutate({
        printFormId: otherForm.printFormId,
        settings: DEFAULT_PRINT_SETTINGS,
        expectedSettings: DEFAULT_PRINT_SETTINGS,
      }),
    ).rejects.toThrow('This print form is not available.');
    await expect(api.printExports.pdf.mutate(packetInput(otherForm.printFormId))).rejects.toThrow(
      'A print form is not available.',
    );
  });

  test('question inspection keeps saved labels and points after the source assessment changes', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const original = await api.printForms.questions.query(form);
    const [{ assessment_question: source }] = await selectPrintFormQuestions(form.printFormId);
    await execute(sql.change_source_question, { assessment_question_id: source.id });
    try {
      expect(await api.printForms.questions.query(form)).toEqual(original);
    } finally {
      await execute(sql.restore_source_question, {
        assessment_question_id: source.id,
        deleted_at: source.deleted_at,
        max_points: source.max_points,
      });
    }
  });

  test('adding a form inherits question settings by question when the new form has different numbers', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const settings = {
      ...DEFAULT_PRINT_SETTINGS,
      questionSizes: { '1': 'full' as const, '2': 'half' as const },
      excludedQuestions: ['2'],
    };
    const source = await api.printForms.create.mutate({ settings });
    const sourceQuestions = await selectPrintFormQuestions(source.printFormId);
    expect(
      sourceQuestions.map(({ print_form_question }) => print_form_question.question_number),
    ).toEqual(['1', '2']);
    const removedQuestion = sourceQuestions[0].assessment_question;

    await execute(sql.change_source_question, { assessment_question_id: removedQuestion.id });
    try {
      const added = await api.printForms.create.mutate({
        settings,
        sourcePrintFormId: source.printFormId,
      });
      const addedQuestions = await selectPrintFormQuestions(added.printFormId);
      expect(addedQuestions.map(({ print_form_question }) => print_form_question)).toMatchObject([
        {
          assessment_question_id: sourceQuestions[1].assessment_question.id,
          question_number: '1',
        },
      ]);
      expect(added.settings.questionSizes).toEqual({ '1': 'half' });
      expect(added.settings.excludedQuestions).toEqual(['1']);
    } finally {
      await execute(sql.restore_source_question, {
        assessment_question_id: removedQuestion.id,
        deleted_at: removedQuestion.deleted_at,
        max_points: removedQuestion.max_points,
      });
    }
  });

  test('rejects creating and regenerating forms for group assessments', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    await execute(sql.set_team_work, { assessment_id: assessment.id, team_work: true });
    try {
      await expect(api.printForms.create.mutate()).rejects.toThrow(
        'Printing group assessments is not available yet.',
      );
      await expect(api.printForms.regenerate.mutate(form)).rejects.toThrow(
        'Printing group assessments is not available yet.',
      );
    } finally {
      await execute(sql.set_team_work, {
        assessment_id: assessment.id,
        team_work: assessment.team_work,
      });
    }
  });

  test('warns about missing question files', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const questions = await api.printForms.questions.query(form);
    const question = await selectQuestionById(questions[0].questionId);
    const course = await selectCourseById(question.course_id);
    const filename = path.join(
      getRuntimeDirectoryForCourse(course),
      'questions',
      question.directory!,
      'question.html',
    );
    const original = await fs.readFile(filename);
    await fs.unlink(filename);
    try {
      const inspected = await api.printForms.questions.query(form);
      expect(inspected[0].concerns).toContain(
        'Could not check this question for printing issues. Review it in the preview before printing.',
      );
      expect(inspected).toHaveLength(questions.length);
    } finally {
      await fs.writeFile(filename, original);
    }
  });

  test('returns an actionable error for a reserved cover label', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.ensureInitial.mutate();
    await expect(
      api.printForms.updateSettings.mutate({
        printFormId: form.printFormId,
        settings: { ...form.settings, identityFields: 'Name' },
        expectedSettings: form.settings,
      }),
    ).rejects.toThrow('Name and Date');
  });

  test('validates export settings and cover PDFs before queueing', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const invalid = packetInput('1');
    invalid.set('metadata', JSON.stringify({ forms: [], document: 'assessment' }));
    await expect(api.printExports.pdf.mutate(invalid)).rejects.toThrow(
      'Invalid print export settings.',
    );
    const form = await api.printForms.create.mutate();
    const invalidCover = packetInput(form.printFormId);
    invalidCover.append(
      'coverPages',
      new File(['invalid PDF'], 'bad.pdf', { type: 'application/pdf' }),
    );
    await expect(api.printExports.pdf.mutate(invalidCover)).rejects.toThrow(
      'valid PDF without password protection',
    );
    const answerKeyCover = packetInput(form.printFormId, 'answer_key');
    answerKeyCover.append(
      'coverPages',
      new File(['unused'], 'cover.pdf', { type: 'application/pdf' }),
    );
    await expect(api.printExports.pdf.mutate(answerKeyCover)).rejects.toThrow(
      'Answer key exports do not use uploaded cover pages.',
    );
  });

  test('preflights every selected form and identifies a form that needs attention', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const first = await api.printForms.create.mutate();
    const second = await api.printForms.create.mutate();
    const cover = await PDFDocument.create();
    cover.addPage();
    const data = new FormData();
    data.set('formIds', JSON.stringify([first.printFormId, second.printFormId]));
    data.set('document', 'assessment');
    data.append('coverPages', new File([Buffer.from(await cover.save())], 'cover.pdf'));
    expect(await api.printExports.preflight.mutate(data)).toEqual({
      coverPageCount: 1,
      failure: null,
    });
    await execute(sql.set_print_form_question_broken, {
      print_form_id: second.printFormId,
      broken: true,
    });
    try {
      expect(await api.printExports.preflight.mutate(data)).toEqual({
        coverPageCount: 0,
        failure: {
          printFormId: second.printFormId,
          formLabel: second.label,
          message: expect.stringContaining(`Form ${second.label}`),
        },
      });
    } finally {
      await execute(sql.set_print_form_question_broken, {
        print_form_id: second.printFormId,
        broken: false,
      });
    }
  });

  test('rejects a predictable page limit before rendering', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const forms = [await api.printForms.create.mutate(), await api.printForms.create.mutate()];
    const data = new FormData();
    data.set(
      'metadata',
      JSON.stringify({
        forms: forms.map(({ printFormId }) => ({ printFormId })),
        document: 'assessment',
      }),
    );
    for (let index = 0; index < forms.length; index++) {
      data.append(
        'pages',
        new File(['<div class="pagedjs_page"></div>'.repeat(5_001)], 'large.html'),
      );
      data.append('snapshotIds', 'placeholder');
    }
    await expect(api.printExports.pdf.mutate(data)).rejects.toThrow(
      'The export would exceed 10,000 pages.',
    );
  });

  test('queues a small PDF and streams the completed export only to its owner', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const { label } = (await selectOptionalPrintForm({
      printFormId: form.printFormId,
      assessmentId: assessment.id,
    }))!;
    const data = packetInput(form.printFormId);
    await appendPrintSnapshot(
      data,
      form.printFormId,
      '<!doctype html><html data-print-status="ready" data-print-question-count="1" data-print-omitted-question-count="0"></html>',
    );
    const pdf = Buffer.from('%PDF-1.4\nbackground export\n');
    const render = vi.spyOn(printExportRender, 'renderPrintExport').mockResolvedValueOnce(pdf);
    let printExportId: string;
    try {
      const result = await api.printExports.pdf.mutate(data);
      expect(result).toEqual({ printExportId: expect.any(String) });
      printExportId = result.printExportId;
      expect(render).not.toHaveBeenCalled();
      expect(await api.printExports.status.query({ printExportId })).toMatchObject({
        status: 'pending',
        format: 'pdf',
        downloadUrl: null,
      });
      expect(
        (await api.printExports.list.query()).find((item) => item.id === printExportId),
      ).toMatchObject({ status: 'pending', label: `Form ${label} PDF`, downloadUrl: null });
      expect(
        (await selectOptionalPrintForm({
          printFormId: form.printFormId,
          assessmentId: assessment.id,
        }))!.question_selection_locked_at,
      ).not.toBeNull();
      await expect(
        api.printForms.updateSettings.mutate({
          printFormId: form.printFormId,
          settings: { ...DEFAULT_PRINT_SETTINGS, excludedQuestions: ['1'] },
          expectedSettings: form.settings,
        }),
      ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
      await completePrintExport(assessment.id, printExportId);
      expect(render).toHaveBeenCalledOnce();
      expect(render.mock.calls[0][0]).toMatchObject({
        snapshots: [{ formLabel: label }],
      });
    } finally {
      render.mockRestore();
    }
    expect(await client(assessment.id).printExports.status.query({ printExportId })).toEqual({
      status: 'succeeded',
      format: 'pdf',
      downloadUrl: `/pl/course_instance/1/instructor/assessment/${assessment.id}/print/exports/${printExportId}`,
      sizeBytes: pdf.length,
      label: `Form ${label} PDF`,
      failureMessage: null,
    });
    expect(
      (await api.printExports.list.query()).find((item) => item.id === printExportId),
    ).toMatchObject({
      status: 'succeeded',
      downloadUrl: `/pl/course_instance/1/instructor/assessment/${assessment.id}/print/exports/${printExportId}`,
    });
    const url = `${siteUrl}/pl/course_instance/1/instructor/assessment/${assessment.id}/print/exports/${printExportId}`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    const printExport = (await selectOptionalPrintExport({
      printExportId,
      assessmentId: assessment.id,
      authnUserId: '1',
    }))!;
    expect(printExport.filename).toMatch(new RegExp(`_form_${label}_assessment\\.pdf$`));
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="${printExport.filename}"`,
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
    const studentResponse = await fetch(url, { headers: { cookie: 'pl_test_user=test_student' } });
    expect(studentResponse.status).toBe(403);
    const otherAssessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam23-printing',
    });
    await expect(
      client(otherAssessment.id).printExports.status.query({ printExportId }),
    ).rejects.toThrow('NOT_FOUND');
    expect(
      (await client(otherAssessment.id).printExports.list.query()).some(
        (item) => item.id === printExportId,
      ),
    ).toBe(false);
    expect(
      (
        await fetch(
          `${siteUrl}/pl/course_instance/1/instructor/assessment/${otherAssessment.id}/print/exports/${printExportId}`,
        )
      ).status,
    ).toBe(404);
    await execute(sql.age_print_export, { print_export_id: printExportId, age: '25 hours' });
    expect(await client(assessment.id).printExports.status.query({ printExportId })).toMatchObject({
      status: 'expired',
      downloadUrl: null,
    });
    expect((await api.printExports.list.query()).some((item) => item.id === printExportId)).toBe(
      false,
    );
    expect((await fetch(url)).status).toBe(404);
  });

  test('queues one combined PDF containing every selected answer key', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const first = await api.printForms.create.mutate();
    const second = await api.printForms.create.mutate();
    const data = new FormData();
    data.set(
      'metadata',
      JSON.stringify({
        forms: [first, second].map(({ printFormId }) => ({ printFormId })),
        document: 'answer_key',
      }),
    );
    const html =
      '<html data-print-status="ready" data-print-question-count="1" data-print-omitted-question-count="0"></html>';
    for (const form of [first, second]) {
      await appendPrintSnapshot(data, form.printFormId, html, 'answer_key');
    }
    const render = vi
      .spyOn(printExportRender, 'renderPrintExport')
      .mockResolvedValueOnce(Buffer.from('%PDF-1.4 combined answer keys'));
    try {
      const { printExportId } = await api.printExports.pdf.mutate(data);
      await completePrintExport(assessment.id, printExportId);
      expect(render.mock.calls[0][0]).toMatchObject({
        document: 'answer_key',
        snapshots: [{ printDocument: 'answer_key' }, { printDocument: 'answer_key' }],
      });
      expect(await api.printExports.status.query({ printExportId })).toMatchObject({
        label: 'PDF with 2 form answer keys',
      });
      expect(
        (await selectOptionalPrintExport({
          printExportId,
          assessmentId: assessment.id,
          authnUserId: '1',
        }))!.filename,
      ).toMatch(/_all_answer_keys\.pdf$/);
    } finally {
      render.mockRestore();
    }
  });

  test('rejects a PDF previewed with question exclusions that differ from the saved form', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const settings = { ...DEFAULT_PRINT_SETTINGS, excludedQuestions: ['1'] };
    const data = packetInput(form.printFormId);
    const html =
      '<!doctype html><html data-print-status="ready" data-print-question-count="1" data-print-omitted-question-count="0"></html>';
    const search = new URLSearchParams(printLayoutSearch(settings));
    search.set('document', 'assessment');
    data.append('pages', new File([html], 'changed-questions.html'));
    data.append(
      'snapshotIds',
      createPrintSnapshotId(
        {
          printFormId: form.printFormId,
          authnUserId: '1',
          search,
          questionListDigest: await printing.getPrintableQuestionListDigest(
            form.printFormId,
            new Set(['1']),
          ),
          html,
          coverDigest: 'unused-by-pdf-exports',
          source: { html: '', figures: [] },
        },
        config.secretKey,
      ),
    );
    await expect(api.printExports.pdf.mutate(data)).rejects.toThrow(
      'This print preview has expired or changed.',
    );
    expect(
      (await selectOptionalPrintForm({
        printFormId: form.printFormId,
        assessmentId: assessment.id,
      }))!.question_selection_locked_at,
    ).toBeNull();
  });

  test('does not lock a regenerated form for an older snapshot', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const oldDigest = await printing.getPrintableQuestionListDigest(form.printFormId, new Set());
    const regenerated = await api.printForms.regenerate.mutate(form);
    expect(regenerated.printFormId).toBe(form.printFormId);
    expect(await printing.getPrintableQuestionListDigest(form.printFormId, new Set())).not.toBe(
      oldDigest,
    );

    await expect(
      queueTestPdf('outdated-form.pdf', [
        {
          printFormId: form.printFormId,
          excludedQuestions: [],
          paperSize: 'Letter',
          questionListDigest: oldDigest,
        },
      ]),
    ).rejects.toThrow('This print preview has expired or changed.');
    expect(
      (await selectOptionalPrintForm({
        printFormId: form.printFormId,
        assessmentId: assessment.id,
      }))!.question_selection_locked_at,
    ).toBeNull();
  });

  test('rejects a multi-form PDF with omitted questions without locking either form', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const first = await api.printForms.create.mutate();
    const second = await api.printForms.create.mutate();
    const data = new FormData();
    data.set(
      'metadata',
      JSON.stringify({
        forms: [first, second].map(({ printFormId }) => ({ printFormId })),
        document: 'assessment',
      }),
    );
    await appendPrintSnapshot(
      data,
      first.printFormId,
      '<html data-print-question-count="1" data-print-omitted-question-count="0"></html>',
    );
    await appendPrintSnapshot(
      data,
      second.printFormId,
      '<html data-print-question-count="1" data-print-omitted-question-count="1"></html>',
    );

    await expect(api.printExports.pdf.mutate(data)).rejects.toMatchObject({
      data: { code: 'BAD_REQUEST' },
      message: expect.stringContaining(`Form ${second.label} has missing or unprintable questions`),
    });
    for (const form of [first, second]) {
      expect(
        (await selectOptionalPrintForm({
          printFormId: form.printFormId,
          assessmentId: assessment.id,
        }))!.question_selection_locked_at,
      ).toBeNull();
    }
  });

  test('queues a Word export with its signed source and streams it only to its owner', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const { label } = (await selectOptionalPrintForm({
      printFormId: form.printFormId,
      assessmentId: assessment.id,
    }))!;
    const printUrl = getPrintFormUrl({
      courseInstanceId: '1',
      assessmentId: assessment.id,
      printFormId: form.printFormId,
    });
    const settings = { ...form.settings, includeGradingTable: true };
    const search = new URLSearchParams(printLayoutSearch(settings));
    search.set('document', 'assessment');
    const source = {
      html: '<p><strong>Queued editable question</strong></p><img data-docx-figure="1">',
      figures: [{ id: '1', width: 120, height: 60, alt: 'Queued diagram' }],
    };
    const html = `<!doctype html><html data-print-form-id="${form.printFormId}" data-print-document="assessment" data-print-form-label="${label}" data-print-paper-size="Letter" data-print-status="ready" data-print-question-count="1" data-print-omitted-question-count="0" data-print-max-points="6" data-print-grading-table='{"questionNumbers":["1"],"rowsPerColumn":1}'><head></head><body><div class="pagedjs_page"></div><div class="pagedjs_page"><section class="printing-question">Queued editable question</section></div></body></html>`;
    const snapshot = {
      html,
      source,
      id: createPrintSnapshotId(
        {
          printFormId: form.printFormId,
          authnUserId: '1',
          search,
          questionListDigest: await printing.getPrintableQuestionListDigest(
            form.printFormId,
            new Set(),
          ),
          coverDigest: digestPrintCoverHtml(
            getPrintCoverHtml(assessment, '/pl/course_instance/1/instructor'),
          ),
          html,
          source,
        },
        config.secretKey,
      ),
    };
    const postDocx = () =>
      fetch(`${siteUrl}${printUrl}/docx?document=assessment`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/octet-stream',
          'X-CSRF-Token': generateCsrfToken({ url: `${printUrl}/docx`, authnUserId: '1' }),
        },
        body: JSON.stringify(snapshot),
      });
    const unsaved = await postDocx();
    expect(unsaved.status).toBe(400);
    expect((await unsaved.json()).error).toContain('This print preview has expired or changed.');
    await api.printForms.updateSettings.mutate({
      printFormId: form.printFormId,
      settings,
      expectedSettings: form.settings,
    });
    const docx = Buffer.from('PK queued Word document');
    const render = vi.spyOn(printExportRender, 'renderPrintExport').mockResolvedValueOnce(docx);
    let printExportId: string;
    try {
      const response = await postDocx();
      expect(response.status).toBe(200);
      ({ printExportId } = z.object({ printExportId: IdSchema }).parse(await response.json()));
      expect(render).not.toHaveBeenCalled();
      expect(await api.printExports.status.query({ printExportId })).toMatchObject({
        status: 'pending',
        format: 'docx',
        downloadUrl: null,
      });
      expect(
        (await selectOptionalPrintForm({
          printFormId: form.printFormId,
          assessmentId: assessment.id,
        }))!.question_selection_locked_at,
      ).not.toBeNull();
      await completePrintExport(assessment.id, printExportId);
      // The cover reads its counts and grading table from the page's root attributes.
      expect(render.mock.calls[0][0]).toMatchObject({
        format: 'docx',
        source,
        footer: {
          left: expect.stringContaining('Spring 2015'),
          center: 'Exam with assessment tools',
          right: `Form ${label}`,
        },
        cover: {
          summary: [
            { term: 'Questions', value: '1' },
            { term: 'Points', value: '6' },
            { term: 'Form', value: label },
          ],
          gradingTable: { questionNumbers: ['1'], rowsPerColumn: 1 },
        },
      });
    } finally {
      render.mockRestore();
    }
    const status = await api.printExports.status.query({ printExportId });
    const downloadUrl = `/pl/course_instance/1/instructor/assessment/${assessment.id}/print/exports/${printExportId}`;
    expect(status).toEqual({
      status: 'succeeded',
      format: 'docx',
      downloadUrl,
      sizeBytes: docx.length,
      label: `Form ${label} Word document`,
      failureMessage: null,
    });
    const printExport = (await selectOptionalPrintExport({
      printExportId,
      assessmentId: assessment.id,
      authnUserId: '1',
    }))!;
    expect(printExport.output_key).toMatch(/\.docx$/);
    expect(printExport.filename).toMatch(new RegExp(`_form_${label}_letter\\.docx$`));
    const download = await fetch(`${siteUrl}${downloadUrl}`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(download.headers.get('content-disposition')).toBe(
      `attachment; filename="${printExport.filename}"`,
    );
    expect(Buffer.from(await download.arrayBuffer())).toEqual(docx);
  });

  test('shows a safe reason when a background PDF fails', async () => {
    const assessment = await printAssessment();
    const courseInstance = await selectCourseInstanceById('1');
    const printExportId = await queuePrintExport({
      formSelections: [],
      owner: {
        assessmentId: assessment.id,
        authnUserId: '1',
        courseId: courseInstance.course_id,
        userId: '1',
      },
      work: {
        format: 'pdf',
        document: 'assessment',
        filename: 'failed-export.pdf',
        snapshots: [],
        covers: [
          { name: 'invalid-cover.pdf', base64: Buffer.from('not a pdf').toString('base64') },
        ],
      },
    });
    await completePrintExport(assessment.id, printExportId, 'failed');
    expect(await client(assessment.id).printExports.status.query({ printExportId })).toMatchObject({
      status: 'failed',
      format: 'pdf',
      downloadUrl: null,
      sizeBytes: null,
      failureMessage:
        '“invalid-cover.pdf” could not be read. Upload a valid PDF without password protection.',
    });
  });

  test('fails an export immediately when its job cannot be queued', async () => {
    const publish = vi
      .spyOn(PrairieMQ.Queue.prototype, 'add')
      .mockRejectedValueOnce(new Error('Redis publication unavailable'));
    try {
      await expect(queueTestPdf('unqueued-export.pdf')).rejects.toThrow(
        'Downloads are unavailable right now.',
      );
    } finally {
      publish.mockRestore();
    }
    expect(
      await queryRow(
        sql.select_print_export_by_filename,
        { filename: 'unqueued-export.pdf' },
        z.object({ status: z.string(), failure_message: z.string().nullable() }),
      ),
    ).toEqual({
      status: 'failed',
      failure_message: 'Downloads are unavailable right now. Try again later or contact support.',
    });
  });

  test('limits how many exports one user can have in progress', async () => {
    const assessment = await printAssessment();
    await execute(sql.fail_pending_print_exports);
    try {
      for (let index = 0; index < 5; index++) {
        await insertPrintExport({
          assessmentId: assessment.id,
          userId: '1',
          authnUserId: '1',
          format: 'pdf',
          filename: `in-progress-${index}.pdf`,
          label: 'In-progress export',
          inputKey: `print-exports/input/in-progress-${index}.json`,
        });
      }
      await expect(queueTestPdf('over-limit.pdf')).rejects.toThrow(
        'You have too many downloads in progress.',
      );
    } finally {
      await execute(sql.fail_pending_print_exports);
    }
  });

  test('reruns an export interrupted by shutdown on another worker', async () => {
    const render = vi
      .spyOn(printExportRender, 'renderPrintExport')
      .mockImplementationOnce(
        async (_work, signal) =>
          await new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('Interrupted')));
          }),
      )
      .mockResolvedValue(Buffer.from('%PDF-1.4 rerun export'));
    try {
      const { assessment, printExportId } = await queueTestPdf('interrupted-export.pdf');
      await printQueue.resume();
      await vi.waitFor(() => expect(render).toHaveBeenCalledOnce(), { timeout: 10_000 });
      beginPrintExportShutdown();
      await waitForPrintExportWorkers();
      expect(
        await selectOptionalPrintExport({
          printExportId,
          assessmentId: assessment.id,
          authnUserId: '1',
        }),
      ).toMatchObject({ status: 'pending' });

      startPrintExportWorker();
      await completePrintExport(assessment.id, printExportId);
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      render.mockRestore();
    }
  });

  test('retries an export when the renderer is busy', async () => {
    const render = vi
      .spyOn(printExportRender, 'renderPrintExport')
      .mockRejectedValueOnce(new RenderQueueFullError())
      .mockResolvedValue(Buffer.from('%PDF-1.4 retried export'));
    try {
      const { assessment, printExportId } = await queueTestPdf('retried-export.pdf');
      await completePrintExport(assessment.id, printExportId);
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      render.mockRestore();
    }
  });

  test('reports exports that no worker finished within 30 minutes as failed', async () => {
    const assessment = await printAssessment();
    // A row without a queued job, as if Redis had lost it.
    const printExportId = await insertPrintExport({
      assessmentId: assessment.id,
      userId: '1',
      authnUserId: '1',
      format: 'pdf',
      filename: 'stale-export.pdf',
      label: 'Stale export',
      inputKey: 'print-exports/input/stale-export.json',
    });
    await execute(sql.age_print_export, { print_export_id: printExportId, age: '31 minutes' });
    expect(await client(assessment.id).printExports.status.query({ printExportId })).toMatchObject({
      status: 'failed',
      failureMessage: 'The export took too long to finish. Try again.',
    });
  });

  test('fails an export that is interrupted on every attempt', async () => {
    const render = vi.spyOn(printExportRender, 'renderPrintExport').mockImplementation(
      async (_work, signal) =>
        await new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('Interrupted')));
        }),
    );
    try {
      const { assessment, printExportId } = await queueTestPdf('exhausted-export.pdf');
      for (let attempt = 1; attempt <= 3; attempt++) {
        await printQueue.resume();
        await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(attempt), { timeout: 10_000 });
        beginPrintExportShutdown();
        await waitForPrintExportWorkers();
        startPrintExportWorker();
      }
      await expect
        .poll(async () => await client(assessment.id).printExports.status.query({ printExportId }))
        .toMatchObject({
          status: 'failed',
          failureMessage:
            'The file could not be prepared after repeated attempts. Try again or contact support.',
        });
    } finally {
      render.mockRestore();
    }
  });

  test('rejects a PDF snapshot from an outdated question list', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const data = packetInput(form.printFormId);
    const html = '<!doctype html><html data-print-status="ready"></html>';
    const search = new URLSearchParams(printLayoutSearch(DEFAULT_PRINT_SETTINGS));
    search.set('document', 'assessment');
    data.append(
      'snapshotIds',
      createPrintSnapshotId(
        {
          printFormId: form.printFormId,
          authnUserId: '1',
          search,
          questionListDigest: 'outdated-question-list',
          html,
          coverDigest: 'unused-by-pdf-exports',
          source: { html: '', figures: [] },
        },
        config.secretKey,
      ),
    );
    data.append('pages', new File([html], 'stale.html'));
    await expect(api.printExports.pdf.mutate(data)).rejects.toThrow(
      'This print preview has expired or changed.',
    );
  });

  test.each([
    ['question order', sql.enable_shuffle],
    ['zone selection', sql.enable_zone_selection],
    ['alternative selection', sql.enable_alternative_selection],
  ])('detects randomized %s even when all question variants are fixed', async (_, query) => {
    const assessment = await printAssessment();
    const form = await client(assessment.id).printForms.ensureInitial.mutate();
    expect(
      (await selectPrintPreparationForms(assessment.id)).find(
        (item) => item.id === form.printFormId,
      )?.has_randomizable_questions,
    ).toBe(true);
    await runInTransactionAndRollback(async () => {
      await execute(sql.set_static_assessment, { assessment_id: assessment.id });
      expect(await assessmentHasPrintRandomization(assessment.id)).toBe(false);
      expect(
        (await selectPrintPreparationForms(assessment.id)).find(
          (item) => item.id === form.printFormId,
        )?.has_randomizable_questions,
      ).toBe(false);
      await execute(query, { assessment_id: assessment.id });
      expect(await assessmentHasPrintRandomization(assessment.id)).toBe(true);
      expect(
        (await selectPrintPreparationForms(assessment.id)).find(
          (item) => item.id === form.printFormId,
        )?.has_randomizable_questions,
      ).toBe(false);
    });
  });

  test('treats choose-all pools as static when variants and order are fixed', async () => {
    const assessment = await printAssessment();
    await runInTransactionAndRollback(async () => {
      await execute(sql.set_static_assessment, { assessment_id: assessment.id });
      // Both zones and alternative groups in this assessment contain exactly one question.
      await execute(sql.choose_all_questions, {
        assessment_id: assessment.id,
        number_choose: 1,
      });
      expect(await assessmentHasPrintRandomization(assessment.id)).toBe(false);
    });
  });

  test.each([false, true])(
    'supports homework question labels with shuffling=%s',
    async (shuffle) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'hw15-lockpoints',
      });
      await execute(sql.set_shuffle_questions, {
        assessment_id: assessment.id,
        shuffle_questions: shuffle,
      });
      try {
        const api = client(assessment.id);
        const form = await api.printForms.create.mutate();
        const questions = await api.printForms.questions.query(form);
        expect(questions).toHaveLength(2);
        expect(questions[0].number).toMatch(shuffle ? /^#\d+$/ : /^HW15\.1$/);
      } finally {
        await execute(sql.set_shuffle_questions, {
          assessment_id: assessment.id,
          shuffle_questions: assessment.shuffle_questions,
        });
      }
    },
  );

  test('lets course viewers inspect forms without changing them', async () => {
    const assessment = await printAssessment();
    const form = await client(assessment.id).printForms.ensureInitial.mutate();
    const courseInstance = await selectCourseInstanceById('1');
    const viewer = await getOrCreateUser({
      uid: 'print-viewer@example.com',
      name: 'Print viewer',
      uin: 'print-viewer',
      email: 'print-viewer@example.com',
    });
    await insertCoursePermissionsByUserUid({
      course_id: courseInstance.course_id,
      uid: viewer.uid,
      course_role: 'Viewer',
      authn_user_id: '1',
    });

    await withUser(viewer, async () => {
      const api = client(assessment.id, viewer.id);
      const forms = await api.printForms.list.query();
      expect(forms.some(({ id }) => id === form.printFormId)).toBe(true);
      const questions = await api.printForms.questions.query(form);
      expect(questions).not.toHaveLength(0);
      await expect(api.printForms.create.mutate()).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
      await expect(api.printForms.ensureInitial.mutate()).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
      await expect(api.printForms.regenerate.mutate(form)).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
      await expect(api.printForms.archive.mutate(form)).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
      await expect(
        api.printForms.reviseSelection.mutate({
          printFormId: form.printFormId,
          questionNumber: questions[0].number,
          included: true,
        }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      await expect(
        api.printForms.setPaperSize.mutate({
          printFormId: form.printFormId,
          paperSize: form.settings.paperSize,
          expectedForms: forms
            .filter(({ archived_at }) => archived_at === null)
            .map((current) => ({
              id: current.id,
              paperSize: current.settings.paperSize,
              locked: current.question_selection_locked_at !== null,
            })),
        }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      await expect(
        api.printForms.updateSettings.mutate({
          printFormId: form.printFormId,
          settings: form.settings,
          expectedSettings: form.settings,
        }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      await expect(api.printExports.preflight.mutate(new FormData())).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
      await expect(
        api.printExports.pdf.mutate(packetInput(form.printFormId)),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });

      const printUrl = getPrintFormUrl({
        courseInstanceId: '1',
        assessmentId: assessment.id,
        printFormId: form.printFormId,
      });
      const response = await fetch(`${siteUrl}${printUrl}/docx`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-CSRF-Token': generateCsrfToken({
            url: `${printUrl}/docx`,
            authnUserId: viewer.id,
          }),
        },
        body: '{}',
      });
      expect(response.status).toBe(403);
      expect(await response.text()).toContain('course editor');
    });
  });

  test('requires course preview permission', async () => {
    const assessment = await printAssessment();
    const response = await fetch(
      `${siteUrl}${getAssessmentTrpcUrl({ courseInstanceId: '1', assessmentId: assessment.id })}/printForms.list`,
      {
        headers: { 'X-TRPC': 'true', cookie: 'pl_test_user=test_student' },
      },
    );
    expect(response.status).toBe(403);
    const student = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student User',
      uin: '000000001',
    });
    const trpcUrl = getAssessmentTrpcUrl({ courseInstanceId: '1', assessmentId: assessment.id });
    const exportResponse = await fetch(`${siteUrl}${trpcUrl}/printExports.pdf`, {
      method: 'POST',
      headers: {
        'X-TRPC': 'true',
        'X-CSRF-Token': generatePrefixCsrfToken(
          { url: trpcUrl, authn_user_id: student.id },
          config.secretKey,
        ),
        cookie: 'pl_test_user=test_student',
      },
      body: packetInput('1'),
    });
    expect(exportResponse.status).toBe(403);
  });
});
