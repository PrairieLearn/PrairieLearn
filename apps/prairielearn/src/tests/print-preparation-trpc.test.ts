import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import * as tmp from 'tmp-promise';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import * as PrairieMQ from '@prairielearn/prairiemq';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { getRuntimeDirectoryForCourse } from '../lib/chunks.js';
import {
  DEFAULT_PRINT_SETTINGS,
  printLayoutSearch,
} from '../lib/client/printing/print-preparation.js';
import { getAssessmentTrpcUrl, getPrintFormUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as printing from '../lib/printing/index.js';
import * as printExportRender from '../lib/printing/print-export-render.js';
import {
  beginPrintExportShutdown,
  initPrintExportWorker,
  processQueuedPrintExports,
  queuePrintExport,
  waitForPrintExportWorkers,
} from '../lib/printing/print-exports.js';
import { createPrintForm } from '../lib/printing/print-forms.js';
import { PrintPacketMetadataSchema } from '../lib/printing/print-packet-schema.js';
import { assessmentHasPrintRandomization } from '../lib/printing/print-preparation.js';
import { createPrintSnapshotId } from '../lib/printing/print-snapshot-id.js';
import { generateCsrfToken } from '../middlewares/csrfToken.js';
import { selectAssessmentById, selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { selectCourseById } from '../models/course.js';
import { selectOptionalPrintExport } from '../models/print-export.js';
import { selectPrintFormQuestions } from '../models/print-form-question.js';
import { selectOptionalPrintForm } from '../models/print-form.js';
import { selectQuestionById } from '../models/question.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import { runInTransactionAndRollback } from './helperDb.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const sql = loadSqlEquiv(import.meta.url);

function client(assessmentId: string) {
  return createAssessmentTrpcClient({
    courseInstanceId: '1',
    assessmentId,
    urlBase: siteUrl,
    csrfToken: generatePrefixCsrfToken(
      { url: getAssessmentTrpcUrl({ courseInstanceId: '1', assessmentId }), authn_user_id: '1' },
      config.secretKey,
    ),
  });
}

function packetInput(
  printFormId: string,
  copies = 1,
  document: 'assessment' | 'answer_key' | 'booklet' = 'assessment',
) {
  const data = new FormData();
  data.set(
    'metadata',
    JSON.stringify({
      forms: [{ printFormId, settings: DEFAULT_PRINT_SETTINGS }],
      copies,
      document,
    }),
  );
  return data;
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
    await processQueuedPrintExports();
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

  async function queueTestPdf(filename: string) {
    const assessment = await printAssessment();
    const courseInstance = await selectCourseInstanceById('1');
    const printExportId = await queuePrintExport({
      owner: {
        assessmentId: assessment.id,
        authnUserId: '1',
        courseId: courseInstance.course_id,
        userId: '1',
      },
      work: {
        format: 'pdf',
        document: 'assessment',
        copies: 1,
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

  test('rejects printable assessment procedures while the feature is disabled', async () => {
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
      await expect(
        api.printableAssessmentExport.pdf.mutate(packetInput('1')),
      ).rejects.toMatchObject({
        data: { code: 'NOT_FOUND' },
      });
      await expect(
        api.printableAssessmentExport.status.query({ printExportId: '1' }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
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
      const first = await api.printForms.create.mutate();
      const second = await api.printForms.create.mutate();
      expect(second.printFormId).not.toBe(first.printFormId);
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
        'id',
        'label',
        'settings',
      ]);
      const questions = await api.printForms.questions.query(first);
      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].number).toBe(
        assessment.type === 'Homework' ? `HW${assessment.number}.1` : '1',
      );
      expect(questions.flatMap((question) => question.concerns)).not.toContain(
        'Could not inspect this question’s source. Review its preview before printing.',
      );
    },
  );

  test('regeneration creates a replacement and preserves the saved original form', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const originalSettings = {
      ...DEFAULT_PRINT_SETTINGS,
      paperSize: 'A4' as const,
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
    });
    expect(
      (await api.printForms.list.query()).find((form) => form.id === first.printFormId),
    ).toMatchObject({ settings: updatedSettings });

    const regenerated = await api.printForms.regenerate.mutate(first);
    expect(regenerated.printFormId).not.toBe(first.printFormId);
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
      }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
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
    const otherUserForm = await createPrintForm({
      assessment,
      course: await selectCourseById(courseInstance.course_id),
      courseInstance,
      userId: otherUser.id,
      authnUserId: '1',
    });
    const api = client(assessment.id);
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
    await expect(
      api.printableAssessmentExport.pdf.mutate(packetInput(otherUserForm.id)),
    ).rejects.toThrow('The printable pages are incomplete.');
    const otherForm = await client(otherAssessment.id).printForms.create.mutate();
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
      }),
    ).rejects.toThrow('This print form is not available.');
    await expect(
      api.printableAssessmentExport.pdf.mutate(packetInput(otherForm.printFormId)),
    ).rejects.toThrow('A print form is not available.');
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

  test('rejects creating and regenerating forms for group assessments', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    await execute(sql.set_team_work, { assessment_id: assessment.id, team_work: true });
    try {
      await expect(api.printForms.create.mutate()).rejects.toThrow(
        'Creating print forms for group assessments is not supported yet.',
      );
      await expect(api.printForms.regenerate.mutate(form)).rejects.toThrow(
        'Creating print forms for group assessments is not supported yet.',
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
        'Could not inspect this question’s source. Review its preview before printing.',
      );
      expect(inspected).toHaveLength(questions.length);
    } finally {
      await fs.writeFile(filename, original);
    }
  });

  test('returns an actionable error for a reserved cover label', async () => {
    const assessment = await printAssessment();
    const input = packetInput('1');
    const metadata = PrintPacketMetadataSchema.parse(JSON.parse(input.get('metadata')!.toString()));
    metadata.forms[0].settings.identityFields = 'Name';
    input.set('metadata', JSON.stringify(metadata));
    await expect(client(assessment.id).printableAssessmentExport.pdf.mutate(input)).rejects.toThrow(
      'Name and Date',
    );
  });

  test('validates export settings and cover PDFs before queueing', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    await expect(api.printableAssessmentExport.pdf.mutate(packetInput('1', 0))).rejects.toThrow(
      'Invalid print export settings.',
    );
    const form = await api.printForms.create.mutate();
    const invalidCover = packetInput(form.printFormId);
    invalidCover.append(
      'coverPages',
      new File(['invalid PDF'], 'bad.pdf', { type: 'application/pdf' }),
    );
    await expect(api.printableAssessmentExport.pdf.mutate(invalidCover)).rejects.toThrow(
      'valid PDF without password protection',
    );
    const answerKeyCover = packetInput(form.printFormId, 1, 'answer_key');
    answerKeyCover.append(
      'coverPages',
      new File(['unused'], 'cover.pdf', { type: 'application/pdf' }),
    );
    await expect(api.printableAssessmentExport.pdf.mutate(answerKeyCover)).rejects.toThrow(
      'Answer key exports do not use uploaded cover pages.',
    );
  });

  test('rejects a predictable page limit before rendering', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const data = packetInput(form.printFormId, 500);
    data.append('pages', new File(['<div class="pagedjs_page"></div>'.repeat(21)], 'large.html'));
    data.append('snapshotIds', 'placeholder');
    await expect(api.printableAssessmentExport.pdf.mutate(data)).rejects.toThrow(
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
    const html = '<!doctype html><html data-print-status="ready"></html>';
    const search = new URLSearchParams(printLayoutSearch(DEFAULT_PRINT_SETTINGS));
    search.set('document', 'assessment');
    data.append('pages', new File([html], `form-${label}.html`));
    data.append(
      'snapshotIds',
      createPrintSnapshotId(
        {
          printFormId: form.printFormId,
          authnUserId: '1',
          search,
          questionListDigest: await printing.getPrintableQuestionListDigest(
            form.printFormId,
            new Set(),
          ),
          html,
          source: { html: '', figures: [] },
        },
        config.secretKey,
      ),
    );
    const pdf = Buffer.from('%PDF-1.4\nbackground export\n');
    const render = vi.spyOn(printExportRender, 'renderPrintExport').mockResolvedValueOnce(pdf);
    let printExportId: string;
    try {
      const result = await api.printableAssessmentExport.pdf.mutate(data);
      expect(result).toEqual({ printExportId: expect.any(String) });
      printExportId = result.printExportId;
      expect(render).not.toHaveBeenCalled();
      expect(await api.printableAssessmentExport.status.query({ printExportId })).toMatchObject({
        status: 'pending',
        format: 'pdf',
        downloadUrl: null,
      });
      await completePrintExport(assessment.id, printExportId);
      expect(render).toHaveBeenCalledOnce();
      expect(render.mock.calls[0][0]).toMatchObject({
        snapshots: [{ formLabel: label }],
      });
    } finally {
      render.mockRestore();
    }
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ printExportId }),
    ).toEqual({
      status: 'succeeded',
      format: 'pdf',
      downloadUrl: `/pl/course_instance/1/instructor/assessment/${assessment.id}/print/exports/${printExportId}`,
      sizeBytes: pdf.length,
      label: `Form ${label} PDF`,
      failureMessage: null,
    });
    const url = `${siteUrl}/pl/course_instance/1/instructor/assessment/${assessment.id}/print/exports/${printExportId}`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    const printExport = (await selectOptionalPrintExport({
      printExportId,
      assessmentId: assessment.id,
      authnUserId: '1',
    }))!;
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
      client(otherAssessment.id).printableAssessmentExport.status.query({ printExportId }),
    ).rejects.toThrow('NOT_FOUND');
    expect(
      (
        await fetch(
          `${siteUrl}/pl/course_instance/1/instructor/assessment/${otherAssessment.id}/print/exports/${printExportId}`,
        )
      ).status,
    ).toBe(404);
    await execute(sql.age_print_export, { print_export_id: printExportId });
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ printExportId }),
    ).toMatchObject({ status: 'expired', downloadUrl: null });
    expect((await fetch(url)).status).toBe(404);
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
    const search = new URLSearchParams({
      paper_size: 'Letter',
      grading_table: 'true',
    });
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
          html,
          source,
        },
        config.secretKey,
      ),
    };
    const docx = Buffer.from('PK queued Word document');
    const render = vi.spyOn(printExportRender, 'renderPrintExport').mockResolvedValueOnce(docx);
    let printExportId: string;
    try {
      const response = await fetch(`${siteUrl}${printUrl}/docx?${search}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/octet-stream',
          'X-CSRF-Token': generateCsrfToken({ url: `${printUrl}/docx`, authnUserId: '1' }),
        },
        body: JSON.stringify(snapshot),
      });
      expect(response.status).toBe(200);
      ({ printExportId } = z.object({ printExportId: IdSchema }).parse(await response.json()));
      expect(render).not.toHaveBeenCalled();
      expect(await api.printableAssessmentExport.status.query({ printExportId })).toMatchObject({
        status: 'pending',
        format: 'docx',
        downloadUrl: null,
      });
      await completePrintExport(assessment.id, printExportId);
      // The cover reads its counts and grading table from the page's root attributes.
      expect(render.mock.calls[0][0]).toMatchObject({
        format: 'docx',
        source,
        footerLabel: `Form ${label}`,
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
    const status = await api.printableAssessmentExport.status.query({ printExportId });
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
      owner: {
        assessmentId: assessment.id,
        authnUserId: '1',
        courseId: courseInstance.course_id,
        userId: '1',
      },
      work: {
        format: 'pdf',
        document: 'booklet',
        copies: 1,
        filename: 'failed-export.pdf',
        snapshots: [],
        covers: [
          { name: 'invalid-cover.pdf', base64: Buffer.from('not a pdf').toString('base64') },
        ],
      },
    });
    await completePrintExport(assessment.id, printExportId, 'failed');
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ printExportId }),
    ).toEqual({
      status: 'failed',
      format: 'pdf',
      downloadUrl: null,
      sizeBytes: null,
      label: null,
      failureMessage:
        '“invalid-cover.pdf” could not be read. Upload a valid PDF without password protection.',
    });
  });

  test('recovers a lost queue publication without rendering a durable job twice', async () => {
    const render = vi
      .spyOn(printExportRender, 'renderPrintExport')
      .mockResolvedValue(Buffer.from('%PDF-1.4 recovered export'));
    const publish = vi
      .spyOn(PrairieMQ.Queue.prototype, 'add')
      .mockRejectedValueOnce(new Error('Redis publication unavailable'));
    try {
      const { assessment, printExportId } = await queueTestPdf('recovered-export.pdf');
      expect(publish).toHaveBeenCalledOnce();
      publish.mockRestore();
      expect(
        await client(assessment.id).printableAssessmentExport.status.query({ printExportId }),
      ).toMatchObject({ status: 'pending' });
      expect(render).not.toHaveBeenCalled();

      await processQueuedPrintExports();
      await processQueuedPrintExports();
      expect(await printQueue.getJobCounts()).toMatchObject({ waiting: 1, active: 0 });
      await completePrintExport(assessment.id, printExportId);
      expect(render).toHaveBeenCalledOnce();
    } finally {
      publish.mockRestore();
      render.mockRestore();
    }
  });

  test('does not count a run interrupted by shutdown as an attempt', async () => {
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
      ).toMatchObject({ status: 'pending', attempts: 0 });

      startPrintExportWorker();
      await completePrintExport(assessment.id, printExportId);
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      render.mockRestore();
    }
  });

  test('fails exports that no worker finished within 24 hours', async () => {
    const { assessment, printExportId } = await queueTestPdf('stale-export.pdf');
    await execute(sql.age_print_export, { print_export_id: printExportId });
    await processQueuedPrintExports();
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ printExportId }),
    ).toMatchObject({
      status: 'failed',
      failureMessage: 'The export did not finish within 24 hours. Try again.',
    });
  });

  test('stops retrying after two crashed rendering attempts', async () => {
    const { assessment, printExportId } = await queueTestPdf('retry-export.pdf');
    await execute(sql.exhaust_print_export_attempts, { print_export_id: printExportId });
    await completePrintExport(assessment.id, printExportId, 'failed');
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ printExportId }),
    ).toEqual({
      status: 'failed',
      format: 'pdf',
      downloadUrl: null,
      sizeBytes: null,
      label: null,
      failureMessage:
        'The export stopped repeatedly while rendering. Try fewer forms or contact support.',
    });
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
          source: { html: '', figures: [] },
        },
        config.secretKey,
      ),
    );
    data.append('pages', new File([html], 'stale.html'));
    await expect(api.printableAssessmentExport.pdf.mutate(data)).rejects.toThrow(
      'This print preview has expired or changed.',
    );
  });

  test.each([
    ['question order', sql.enable_shuffle],
    ['zone selection', sql.enable_zone_selection],
    ['alternative selection', sql.enable_alternative_selection],
  ])('detects randomized %s even when all question variants are fixed', async (_, query) => {
    const assessment = await printAssessment();
    await runInTransactionAndRollback(async () => {
      await execute(sql.set_static_assessment, { assessment_id: assessment.id });
      expect(await assessmentHasPrintRandomization(assessment.id)).toBe(false);
      await execute(query, { assessment_id: assessment.id });
      expect(await assessmentHasPrintRandomization(assessment.id)).toBe(true);
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
    const exportResponse = await fetch(`${siteUrl}${trpcUrl}/printableAssessmentExport.pdf`, {
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
