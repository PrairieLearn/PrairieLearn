import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import * as tmp from 'tmp-promise';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getFromS3, uploadToS3 } from '../lib/aws.js';
import { getRuntimeDirectoryForCourse } from '../lib/chunks.js';
import { DEFAULT_PRINT_SETTINGS, printLayoutSearch } from '../lib/client/print-preparation.js';
import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import { getFileStoreS3Bucket } from '../lib/file-store.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import {
  cleanExpiredPrintExports,
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
  beforeAll(async () => {
    // File-error tests must not modify the course used by other test workers.
    courseDirectory = await tmp.dir({ unsafeCleanup: true });
    await fs.cp(TEST_COURSE_PATH, courseDirectory.path, { recursive: true });
    await helperServer.before(courseDirectory.path)();
    await features.enable('printable-assessments');
  });
  afterAll(async () => {
    await helperServer.after();
    await courseDirectory.cleanup();
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
        ready: false,
      });
      await processQueuedPrintExports();
      await waitForPrintExportWorkers();
      expect(render).toHaveBeenCalledOnce();
    } finally {
      render.mockRestore();
    }
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
    ).toEqual({
      status: 'Success',
      ready: true,
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
      ready: false,
      sizeBytes: null,
      exportLabel: null,
      failureMessage: null,
      canViewJobLogs: true,
    });
    expect((await fetch(url)).status).toBe(404);
    await expect(getFromS3(bucket, inputKey, true)).rejects.toThrow();
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
        document: 'booklet',
        copies: 1,
        filename: 'failed-export.pdf',
        snapshots: [],
        covers: [
          { name: 'invalid-cover.pdf', base64: Buffer.from('not a pdf').toString('base64') },
        ],
      },
    });
    await processQueuedPrintExports();
    await expect
      .poll(
        async () =>
          (
            await selectPrintExportJob({
              jobSequenceId,
              assessmentId: assessment.id,
              authnUserId: '1',
            })
          )?.status,
      )
      .toBe('Error');
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
    ).toEqual({
      status: 'Error',
      ready: false,
      sizeBytes: null,
      exportLabel: null,
      failureMessage:
        '“invalid-cover.pdf” could not be read. Upload a valid PDF without password protection.',
      canViewJobLogs: true,
    });
  });

  test('reports missing browser configuration from the queued worker', async () => {
    const assessment = await printAssessment();
    const courseInstance = await selectCourseInstanceById('1');
    const available = vi.spyOn(printing, 'isBrowserRenderingAvailable').mockReturnValue(false);
    try {
      const jobSequenceId = await queuePrintExport({
        owner: {
          assessmentId: assessment.id,
          authnUserId: '1',
          courseId: courseInstance.course_id,
          courseInstanceId: '1',
          userId: '1',
        },
        work: {
          document: 'assessment',
          copies: 1,
          filename: 'unavailable-export.pdf',
          snapshots: [],
          covers: [],
        },
      });
      await processQueuedPrintExports();
      await waitForPrintExportWorkers();
      expect(
        await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
      ).toMatchObject({
        status: 'Error',
        ready: false,
        failureMessage: 'PDF rendering is not configured on this server.',
      });
    } finally {
      available.mockRestore();
    }
  });

  test('stops retrying after three expired worker leases', async () => {
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
        document: 'assessment',
        copies: 1,
        filename: 'retry-export.pdf',
        snapshots: [],
        covers: [],
      },
    });
    await execute(sql.expire_print_export_lease, { job_sequence_id: jobSequenceId });
    await processQueuedPrintExports();
    expect(
      await client(assessment.id).printableAssessmentExport.status.query({ jobSequenceId }),
    ).toEqual({
      status: 'Error',
      ready: false,
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
