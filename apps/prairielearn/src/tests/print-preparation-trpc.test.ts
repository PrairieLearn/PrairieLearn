import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import * as tmp from 'tmp-promise';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import * as PrairieMQ from '@prairielearn/prairiemq';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { withResolvers } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import { getFromS3, uploadToS3 } from '../lib/aws.js';
import { getRuntimeDirectoryForCourse } from '../lib/chunks.js';
import { DEFAULT_PRINT_SETTINGS, printLayoutSearch } from '../lib/client/print-preparation.js';
import { getAssessmentTrpcUrl, getPrintFormUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import { getFileStoreS3Bucket } from '../lib/file-store.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import {
  beginPrintExportShutdown,
  cleanExpiredPrintExports,
  initPrintExportQueue,
  processQueuedPrintExports,
  queuePrintExport,
  selectPrintExportJob,
  waitForPrintExportWorkers,
} from '../lib/print-export-jobs.js';
import * as printExportRender from '../lib/print-export-render.js';
import { createPrintForm } from '../lib/print-forms.js';
import { PrintPacketMetadataSchema } from '../lib/print-packet-schema.js';
import { assessmentHasPrintRandomization } from '../lib/print-preparation.js';
import * as printing from '../lib/printing/index.js';
import { createPrintSnapshotId } from '../lib/printing/print-snapshot-id.js';
import { selectJobsByJobSequenceId } from '../lib/server-jobs.js';
import { generateCsrfToken } from '../middlewares/csrfToken.js';
import { selectAssessmentById, selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  insertCoursePermissionsByUserUid,
  upsertCourseInstancePermissionsRole,
} from '../models/course-permissions.js';
import { selectCourseById } from '../models/course.js';
import { selectPrintFormQuestions } from '../models/print-form-question.js';
import { selectOptionalPrintForm } from '../models/print-form.js';
import { selectQuestionById } from '../models/question.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import { runInTransactionAndRollback } from './helperDb.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

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
      forms: [{ printFormId, formLabel: 'A', settings: DEFAULT_PRINT_SETTINGS }],
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
    jobSequenceId: string,
    status: 'Success' | 'Error' = 'Success',
  ) {
    await processQueuedPrintExports();
    await printQueue.resume();
    await expect
      .poll(
        async () =>
          (
            await selectPrintExportJob({
              jobSequenceId,
              assessmentId,
              authnUserId: '1',
            })
          )?.status,
        { timeout: 10_000 },
      )
      .toBe(status);
  }

  async function queueTestPdf(filename: string) {
    const assessment = await printAssessment();
    const courseInstance = await selectCourseInstanceById('1');
    const jobSequenceId = await queuePrintExport({
      owner: {
        assessmentId: assessment.id,
        authnUserId: '1',
        courseId: courseInstance.course_id,
        courseInstanceId: '1',
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
    return { assessment, jobSequenceId };
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
    await initPrintExportQueue();
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
        api.printableAssessmentExport.status.query({ jobSequenceId: '1' }),
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
          userId: '1',
        }),
      ).toMatchObject({ user_id: '1', authn_user_id: '1' });
      expect((await selectAssessmentById(assessment.id)).multiple_instance).toBe(false);
      const forms = await api.printForms.list.query();
      expect(forms.map((form) => form.id)).toEqual([second.printFormId, first.printFormId]);
      expect(Object.keys(forms[0]).sort()).toEqual(['assessment_id', 'created_at', 'id']);
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
    const first = await api.printForms.create.mutate();
    const original = await selectPrintFormQuestions(first.printFormId);
    const originalQuestions = await api.printForms.questions.query(first);
    const regenerated = await api.printForms.regenerate.mutate(first);
    expect(regenerated.printFormId).not.toBe(first.printFormId);
    expect(await selectPrintFormQuestions(first.printFormId)).toEqual(original);
    expect(await api.printForms.questions.query(first)).toEqual(originalQuestions);
    expect(await api.printForms.questions.query(regenerated)).toHaveLength(
      originalQuestions.length,
    );
  });

  test('does not expose or regenerate another user’s form or another assessment’s form', async () => {
    const assessment = await printAssessment();
    const otherAssessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam23-printing',
    });
    const otherUser = await getOrCreateUser({
      uid: 'print-student@example.com',
      name: 'Print student',
      uin: '555555555',
      email: 'print-student@example.com',
    });
    const courseInstance = await selectCourseInstanceById('1');
    const otherUserForm = await createPrintForm({
      assessment,
      course: await selectCourseById(courseInstance.course_id),
      courseInstance,
      userId: otherUser.id,
      authnUserId: '1',
    });
    const api = client(assessment.id);
    expect((await api.printForms.list.query()).some((form) => form.id === otherUserForm.id)).toBe(
      false,
    );
    await expect(api.printForms.questions.query({ printFormId: otherUserForm.id })).rejects.toThrow(
      'This print form is not available.',
    );
    await expect(
      api.printForms.regenerate.mutate({ printFormId: otherUserForm.id }),
    ).rejects.toThrow('This print form is not available.');
    await expect(
      api.printableAssessmentExport.pdf.mutate(packetInput(otherUserForm.id)),
    ).rejects.toThrow('A print form is not available.');
    const otherForm = await client(otherAssessment.id).printForms.create.mutate();
    await expect(api.printForms.questions.query(otherForm)).rejects.toThrow(
      'This print form is not available.',
    );
    await expect(api.printForms.regenerate.mutate(otherForm)).rejects.toThrow(
      'This print form is not available.',
    );
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

  test('validates packet export settings before rendering', async () => {
    const assessment = await printAssessment();
    await expect(
      client(assessment.id).printableAssessmentExport.pdf.mutate(packetInput('1', 0)),
    ).rejects.toThrow('Invalid print export settings.');
  });

  test('validates custom cover PDFs on individual form exports before rendering', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const data = packetInput(form.printFormId);
    data.append('coverPages', new File(['invalid PDF'], 'bad.pdf', { type: 'application/pdf' }));
    await expect(api.printableAssessmentExport.pdf.mutate(data)).rejects.toThrow(
      'valid PDF without password protection',
    );
  });

  test('rejects cover PDFs on answer key exports', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const data = packetInput(form.printFormId, 1, 'answer_key');
    data.append('coverPages', new File(['unused'], 'cover.pdf', { type: 'application/pdf' }));
    await expect(api.printableAssessmentExport.pdf.mutate(data)).rejects.toThrow(
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
    const data = packetInput(form.printFormId);
    const html = '<!doctype html><html data-print-status="ready"></html>';
    const search = new URLSearchParams(printLayoutSearch(DEFAULT_PRINT_SETTINGS));
    search.set('form_label', 'A');
    search.set('document', 'assessment');
    data.append('pages', new File([html], 'form-a.html'));
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
    let jobSequenceId: string;
    try {
      const result = await api.printableAssessmentExport.pdf.mutate(data);
      expect(result).toEqual({ jobSequenceId: expect.any(String) });
      jobSequenceId = result.jobSequenceId;
      expect(render).not.toHaveBeenCalled();
      expect(await api.printableAssessmentExport.status.query({ jobSequenceId })).toMatchObject({
        status: 'Running',
        format: 'pdf',
        ready: false,
        downloadUrl: null,
      });
      await completePrintExport(assessment.id, jobSequenceId);
      expect(render).toHaveBeenCalledOnce();
    } finally {
      render.mockRestore();
    }
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
    ).toEqual({
      status: 'Success',
      format: 'pdf',
      ready: true,
      downloadUrl: `/pl/course_instance/1/instructor/assessment/${assessment.id}/print_preparation/exports/${jobSequenceId}.pdf`,
      sizeBytes: pdf.length,
      exportLabel: 'Form A PDF',
      failureMessage: null,
      canViewJobLogs: true,
    });
    const url = `${siteUrl}/pl/course_instance/1/instructor/assessment/${assessment.id}/print_preparation/exports/${jobSequenceId}.pdf`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    const job = (await selectPrintExportJob({
      jobSequenceId,
      assessmentId: assessment.id,
      authnUserId: '1',
    }))!;
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="${job.result!.filename}"`,
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
    expect((await fetch(url.replace('.pdf', '.docx'))).status).toBe(404);
    const studentResponse = await fetch(url, { headers: { cookie: 'pl_test_user=test_student' } });
    expect(studentResponse.status).toBe(403);
    const otherAssessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam23-printing',
    });
    await expect(
      client(otherAssessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
    ).rejects.toThrow('NOT_FOUND');
    expect(
      (
        await fetch(
          `${siteUrl}/pl/course_instance/1/instructor/assessment/${otherAssessment.id}/print_preparation/exports/${jobSequenceId}.pdf`,
        )
      ).status,
    ).toBe(404);
    const inputKey = `print-exports/input/${randomUUID()}.json`;
    const bucket = getFileStoreS3Bucket();
    await uploadToS3(bucket, inputKey, null, false, Buffer.from('{}'));
    await execute(sql.add_print_export_input_key, {
      job_sequence_id: jobSequenceId,
      input_key: inputKey,
    });
    await execute(sql.age_print_export_job, { job_sequence_id: jobSequenceId });
    await execute(sql.age_print_export_sequence, { job_sequence_id: jobSequenceId });
    await cleanExpiredPrintExports();
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
    ).toEqual({
      status: 'Success',
      format: 'pdf',
      ready: false,
      downloadUrl: null,
      sizeBytes: null,
      exportLabel: null,
      failureMessage: null,
      canViewJobLogs: true,
    });
    expect((await fetch(url)).status).toBe(404);
    await expect(getFromS3(bucket, inputKey, true)).rejects.toThrow();
  });

  test('queues a Word export with its signed source and streams it only to its owner', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const printUrl = getPrintFormUrl({
      courseInstanceId: '1',
      assessmentId: assessment.id,
      printFormId: form.printFormId,
    });
    const search = new URLSearchParams({
      paper_size: 'Letter',
      form_label: 'A',
      grading_table: 'true',
    });
    const source = {
      html: '<p><strong>Queued editable question</strong></p><img data-docx-figure="1">',
      figures: [{ id: '1', width: 120, height: 60, alt: 'Queued diagram' }],
    };
    const html = `<!doctype html><html data-print-form-id="${form.printFormId}" data-print-document="assessment" data-print-form-label="A" data-print-paper-size="Letter" data-print-status="ready" data-print-question-count="1" data-print-omitted-question-count="0" data-print-max-points="6" data-print-grading-table='{"questionNumbers":["1"],"rowsPerColumn":1}'><head></head><body><div class="pagedjs_page"></div><div class="pagedjs_page"><section class="printing-question">Queued editable question</section></div></body></html>`;
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
    let jobSequenceId: string;
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
      ({ jobSequenceId } = z.object({ jobSequenceId: IdSchema }).parse(await response.json()));
      expect(render).not.toHaveBeenCalled();
      expect(await api.printableAssessmentExport.status.query({ jobSequenceId })).toMatchObject({
        status: 'Running',
        ready: false,
        format: 'docx',
        downloadUrl: null,
      });
      await completePrintExport(assessment.id, jobSequenceId);
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'docx',
          source,
          cover: expect.objectContaining({
            summary: [
              { term: 'Questions', value: '1' },
              { term: 'Points', value: '6' },
              { term: 'Form', value: 'A' },
            ],
            gradingTable: { questionNumbers: ['1'], rowsPerColumn: 1 },
            sections: expect.arrayContaining([
              expect.objectContaining({
                heading: 'Instructions',
                blocks: expect.arrayContaining([
                  expect.objectContaining({
                    type: 'list',
                    ordered: true,
                    items: expect.any(Array),
                  }),
                ]),
              }),
            ]),
          }),
          footerLabel: 'Form A',
          snapshot: expect.objectContaining({
            html,
            assetScope: expect.objectContaining({ printFormId: form.printFormId }),
          }),
        }),
        expect.any(AbortSignal),
      );
    } finally {
      render.mockRestore();
    }
    const status = await api.printableAssessmentExport.status.query({ jobSequenceId });
    const downloadUrl = `/pl/course_instance/1/instructor/assessment/${assessment.id}/print_preparation/exports/${jobSequenceId}.docx`;
    expect(status).toEqual({
      status: 'Success',
      format: 'docx',
      ready: true,
      downloadUrl,
      sizeBytes: docx.length,
      exportLabel: 'Form A Word document',
      failureMessage: null,
      canViewJobLogs: true,
    });
    const job = (await selectPrintExportJob({
      jobSequenceId,
      assessmentId: assessment.id,
      authnUserId: '1',
    }))!;
    expect(job.result!.key).toMatch(/\.docx$/);
    const download = await fetch(`${siteUrl}${downloadUrl}`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(download.headers.get('content-disposition')).toBe(
      `attachment; filename="${job.result!.filename}"`,
    );
    expect(Buffer.from(await download.arrayBuffer())).toEqual(docx);
    expect((await fetch(`${siteUrl}${downloadUrl.replace('.docx', '.pdf')}`)).status).toBe(404);
    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Instructor User',
      uin: '100000000',
    });
    const courseInstance = await selectCourseInstanceById('1');
    await insertCoursePermissionsByUserUid({
      course_id: courseInstance.course_id,
      uid: instructor.uid,
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    expect(
      (
        await fetch(`${siteUrl}${downloadUrl}`, {
          headers: {
            cookie:
              'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=Previewer; pl2_requested_course_instance_role=None',
          },
        })
      ).status,
    ).toBe(404);
    await execute(sql.age_print_export_job, { job_sequence_id: jobSequenceId });
    await execute(sql.age_print_export_sequence, { job_sequence_id: jobSequenceId });
    await cleanExpiredPrintExports();
    expect(await api.printableAssessmentExport.status.query({ jobSequenceId })).toMatchObject({
      status: 'Success',
      format: 'docx',
      ready: false,
      downloadUrl: null,
    });
    expect((await fetch(`${siteUrl}${downloadUrl}`)).status).toBe(404);
  });

  test('shows a safe reason when a background PDF fails', async () => {
    const assessment = await printAssessment();
    const courseInstance = await selectCourseInstanceById('1');
    const jobSequenceId = await queuePrintExport({
      owner: {
        assessmentId: assessment.id,
        authnUserId: '1',
        courseId: courseInstance.course_id,
        courseInstanceId: '1',
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
    await completePrintExport(assessment.id, jobSequenceId, 'Error');
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
    ).toEqual({
      status: 'Error',
      format: 'pdf',
      ready: false,
      downloadUrl: null,
      sizeBytes: null,
      exportLabel: null,
      failureMessage:
        '“invalid-cover.pdf” could not be read. Upload a valid PDF without password protection.',
      canViewJobLogs: true,
    });
  });

  test.each(['pdf', 'docx'] as const)(
    'reports missing browser configuration from the queued %s worker',
    async (format) => {
      const assessment = await printAssessment();
      const courseInstance = await selectCourseInstanceById('1');
      const available = vi.spyOn(printing, 'isBrowserRenderingAvailable').mockReturnValue(false);
      const work: printExportRender.PrintExportWork =
        format === 'pdf'
          ? {
              format,
              document: 'assessment',
              copies: 1,
              filename: 'unavailable-export.pdf',
              snapshots: [],
              covers: [],
            }
          : {
              format,
              document: 'assessment',
              filename: 'unavailable-export.docx',
              snapshot: {
                formLabel: 'A',
                paperSize: 'Letter',
                printDocument: 'assessment',
                localPreviewUrl: 'http://localhost/',
                html: '',
                assetScope: {
                  courseInstanceId: '1',
                  assessmentId: assessment.id,
                  printFormId: '1',
                  printFormQuestionIds: [],
                  authnUserId: '1',
                  userId: '1',
                },
              },
              source: { html: '', figures: [] },
              footerLabel: 'Form A',
            };
      try {
        const jobSequenceId = await queuePrintExport({
          owner: {
            assessmentId: assessment.id,
            authnUserId: '1',
            courseId: courseInstance.course_id,
            courseInstanceId: '1',
            userId: '1',
          },
          work,
        });
        await completePrintExport(assessment.id, jobSequenceId, 'Error');
        expect(
          await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
        ).toMatchObject({
          status: 'Error',
          format,
          ready: false,
          downloadUrl: null,
          failureMessage: `${format === 'docx' ? 'Word' : 'PDF'} rendering is not configured on this server.`,
        });
      } finally {
        available.mockRestore();
      }
    },
  );

  test('separates default queue namespaces for different PostgreSQL deployments', async () => {
    const createQueue = vi.spyOn(PrairieMQ, 'Queue');
    const prefixes = new Set<string>();
    const host = `test-print-host-${randomUUID()}`;
    const explicitPrefix = `test-print-override-${randomUUID()}`;

    async function deploymentPrefix(
      database: string,
      hostname = host,
      prefix: string | null = null,
    ) {
      beginPrintExportShutdown();
      await waitForPrintExportWorkers();
      return await withConfig(
        {
          postgresqlHost: hostname,
          postgresqlDatabase: database,
          printExportQueuePrefix: prefix,
        },
        async () => {
          await initPrintExportQueue();
          const [, options] = createQueue.mock.calls.at(-1)!;
          const resolvedPrefix = options.prefix!;
          prefixes.add(resolvedPrefix);
          beginPrintExportShutdown();
          await waitForPrintExportWorkers();
          return resolvedPrefix;
        },
      );
    }

    try {
      const firstPrefix = await deploymentPrefix('first');
      const secondPrefix = await deploymentPrefix('second');
      const otherHostPrefix = await deploymentPrefix('first', `${host}-other`);
      expect(new Set([firstPrefix, secondPrefix, otherHostPrefix]).size).toBe(3);
      expect(await deploymentPrefix('first', host, explicitPrefix)).toBe(explicitPrefix);

      for (const [prefix, deployment] of [
        [firstPrefix, 'first'],
        [secondPrefix, 'second'],
      ]) {
        const producer = new PrairieMQ.Queue('print-exports', {
          redisUrl: config.nonVolatileRedisUrl!,
          prefix,
        });
        try {
          await producer.pause();
          await producer.add('render', { jobId: '1', deployment }, { jobId: 'print-export-1' });
          expect(await producer.getJobStatus('print-export-1')).toMatchObject({
            state: 'waiting',
            job: { data: { jobId: '1', deployment } },
          });
        } finally {
          await producer.close();
        }
      }
    } finally {
      beginPrintExportShutdown();
      await waitForPrintExportWorkers();
      createQueue.mockRestore();
      for (const prefix of prefixes) {
        const cleanupQueue = new PrairieMQ.Queue('print-exports', {
          redisUrl: config.nonVolatileRedisUrl!,
          prefix,
        });
        try {
          await cleanupQueue.obliterate();
        } finally {
          await cleanupQueue.close();
        }
      }
      await initPrintExportQueue();
    }
  });

  test('recovers a lost queue publication without rendering a durable job twice', async () => {
    const render = vi
      .spyOn(printExportRender, 'renderPrintExport')
      .mockResolvedValue(Buffer.from('%PDF-1.4 recovered export'));
    const publish = vi
      .spyOn(PrairieMQ.Queue.prototype, 'add')
      .mockRejectedValueOnce(new Error('Redis publication unavailable'));
    try {
      const { assessment, jobSequenceId } = await queueTestPdf('recovered-export.pdf');
      expect(publish).toHaveBeenCalledOnce();
      publish.mockRestore();
      expect(
        await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
      ).toMatchObject({ status: 'Running', ready: false });
      expect(render).not.toHaveBeenCalled();

      await processQueuedPrintExports();
      await processQueuedPrintExports();
      expect(await printQueue.getJobCounts()).toMatchObject({ waiting: 1, active: 0 });
      await completePrintExport(assessment.id, jobSequenceId);
      expect(render).toHaveBeenCalledOnce();
    } finally {
      publish.mockRestore();
      render.mockRestore();
    }
  });

  test('fences an old rendering attempt from completing a replacement attempt', async () => {
    const oldRender = withResolvers<Buffer>();
    const render = vi
      .spyOn(printExportRender, 'renderPrintExport')
      .mockReturnValueOnce(oldRender.promise)
      .mockResolvedValue(Buffer.from('%PDF-1.4 replacement export'));
    try {
      const { assessment, jobSequenceId } = await queueTestPdf('replacement-export.pdf');
      await printQueue.resume();
      await vi.waitFor(() => expect(render).toHaveBeenCalledOnce(), { timeout: 10_000 });
      await execute(sql.replace_print_export_owner, { job_sequence_id: jobSequenceId });
      await printQueue.pause();
      oldRender.resolve(Buffer.from('%PDF-1.4 obsolete export'));
      await expect
        .poll(async () => (await printQueue.getJobCounts()).active, { timeout: 10_000 })
        .toBe(0);
      expect(await selectJobsByJobSequenceId(jobSequenceId)).toMatchObject([
        { status: 'Running', data: { runOwner: 'replacement-owner' } },
      ]);
      expect(
        await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
      ).toMatchObject({ status: 'Running', ready: false, downloadUrl: null });

      await completePrintExport(assessment.id, jobSequenceId);
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      oldRender.resolve(Buffer.from('%PDF-1.4 obsolete export'));
      render.mockRestore();
    }
  });

  test('keeps the two-export limit shared with another queue worker', async () => {
    const gate = withResolvers<Buffer>();
    const render = vi.spyOn(printExportRender, 'renderPrintExport').mockReturnValue(gate.promise);
    const otherProcessor = vi.fn(async () => undefined);
    let otherWorker: PrairieMQ.Worker | undefined;
    try {
      const queued = await Promise.all(
        Array.from({ length: 3 }, (_, index) => queueTestPdf(`concurrent-export-${index}.pdf`)),
      );
      await printQueue.resume();
      await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2), { timeout: 10_000 });
      otherWorker = new PrairieMQ.Worker('print-exports', otherProcessor, {
        redisUrl: config.nonVolatileRedisUrl!,
        prefix: testQueuePrefix,
        concurrency: 2,
        groupConcurrency: 2,
      });
      await otherWorker.waitUntilReady();
      await sleep(200);
      expect(otherProcessor).not.toHaveBeenCalled();
      expect(await printQueue.getGroups()).toEqual([{ id: null, waiting: 1, active: 2 }]);
      await otherWorker.close();
      otherWorker = undefined;
      gate.resolve(Buffer.from('%PDF-1.4 concurrent export'));
      for (const { assessment, jobSequenceId } of queued) {
        await completePrintExport(assessment.id, jobSequenceId);
      }
      expect(render).toHaveBeenCalledTimes(3);
    } finally {
      await otherWorker?.close(true);
      gate.resolve(Buffer.from('%PDF-1.4 concurrent export'));
      render.mockRestore();
    }
  });

  test('stops retrying after three interrupted rendering attempts', async () => {
    const assessment = await printAssessment();
    const courseInstance = await selectCourseInstanceById('1');
    const jobSequenceId = await queuePrintExport({
      owner: {
        assessmentId: assessment.id,
        authnUserId: '1',
        courseId: courseInstance.course_id,
        courseInstanceId: '1',
        userId: '1',
      },
      work: {
        format: 'pdf',
        document: 'assessment',
        copies: 1,
        filename: 'retry-export.pdf',
        snapshots: [],
        covers: [],
      },
    });
    await execute(sql.exhaust_print_export_attempts, { job_sequence_id: jobSequenceId });
    await completePrintExport(assessment.id, jobSequenceId, 'Error');
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
    ).toEqual({
      status: 'Error',
      format: 'pdf',
      ready: false,
      downloadUrl: null,
      sizeBytes: null,
      exportLabel: null,
      failureMessage:
        'The export stopped repeatedly while rendering. Try fewer forms or contact support.',
      canViewJobLogs: true,
    });
  });

  test('rejects a changed PDF snapshot before rendering', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const form = await api.printForms.create.mutate();
    const data = packetInput(form.printFormId);
    const html = '<!doctype html><html data-print-status="ready"></html>';
    const search = new URLSearchParams(printLayoutSearch(DEFAULT_PRINT_SETTINGS));
    search.set('form_label', 'A');
    search.set('document', 'assessment');
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
    data.append('pages', new File([html + 'changed'], 'changed.html'));
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

  test('authorizes course previewers to export PDFs containing answer keys', async () => {
    const assessment = await printAssessment();
    const courseInstance = await selectCourseInstanceById('1');
    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Instructor User',
      uin: '100000000',
    });
    await insertCoursePermissionsByUserUid({
      course_id: courseInstance.course_id,
      uid: instructor.uid,
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    await upsertCourseInstancePermissionsRole({
      course_id: courseInstance.course_id,
      course_instance_id: courseInstance.id,
      user_id: instructor.id,
      course_instance_role: 'Student Data Editor',
      authn_user_id: '1',
    });
    const form = await createPrintForm({
      assessment,
      course: await selectCourseById(courseInstance.course_id),
      courseInstance,
      userId: instructor.id,
      authnUserId: instructor.id,
    });
    const trpcUrl = getAssessmentTrpcUrl({ courseInstanceId: '1', assessmentId: assessment.id });
    const headers = {
      'X-TRPC': 'true',
      'X-CSRF-Token': generatePrefixCsrfToken(
        { url: trpcUrl, authn_user_id: instructor.id },
        config.secretKey,
      ),
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=Previewer; pl2_requested_course_instance_role=None',
    };

    for (const document of ['assessment', 'answer_key', 'booklet'] as const) {
      const response = await fetch(`${siteUrl}${trpcUrl}/printableAssessmentExport.pdf`, {
        method: 'POST',
        headers,
        body: packetInput(form.id, 1, document),
      });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain('The printable pages are incomplete.');
    }
  });
});
