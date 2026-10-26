import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import * as tmp from 'tmp-promise';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { makeAssessmentInstance } from '../lib/assessment.js';
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
  storeCompletedPrintExport,
} from '../lib/print-export-jobs.js';
import { PrintPacketMetadataSchema } from '../lib/print-packet-schema.js';
import { assessmentHasPrintRandomization } from '../lib/print-preparation.js';
import { getPrintableQuestionListDigest } from '../lib/printing/index.js';
import { createPrintSnapshotId } from '../lib/printing/print-snapshot-id.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentById, selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  insertCoursePermissionsByUserUid,
  upsertCourseInstancePermissionsRole,
} from '../models/course-permissions.js';
import { selectCourseById } from '../models/course.js';
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
  assessmentInstanceId: string,
  copies = 1,
  document: 'assessment' | 'answer_key' | 'booklet' = 'assessment',
) {
  const data = new FormData();
  data.set(
    'metadata',
    JSON.stringify({
      instances: [{ assessmentInstanceId, formLabel: 'A', settings: DEFAULT_PRINT_SETTINGS }],
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
      await expect(api.printableAssessments.list.query()).rejects.toMatchObject({
        data: { code: 'NOT_FOUND' },
      });
      await expect(api.printableAssessments.create.mutate()).rejects.toMatchObject({
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
    'creates independent instructor instances even when students only get one attempt (%s)',
    async (tid) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid,
      });
      const api = client(assessment.id);
      expect(assessment.multiple_instance).toBe(false);
      const first = await api.printableAssessments.create.mutate();
      const second = await api.printableAssessments.create.mutate();
      expect(second.assessmentInstanceId).not.toBe(first.assessmentInstanceId);
      const instance = await selectAssessmentInstanceById(first.assessmentInstanceId);
      const secondInstance = await selectAssessmentInstanceById(second.assessmentInstanceId);
      expect(instance.user_id).toBe('1');
      expect(instance.include_in_statistics).toBe(false);
      expect(instance.auto_close).toBe(false);
      expect(secondInstance.number).toBe(instance.number + 1);
      expect(secondInstance.include_in_statistics).toBe(false);
      expect((await selectAssessmentById(assessment.id)).multiple_instance).toBe(false);
      const questions = await api.printableAssessments.questions.query(first);
      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].number).toBe(
        assessment.type === 'Homework' ? `HW${assessment.number}.1` : '1',
      );
      expect(questions.flatMap((question) => question.concerns)).not.toContain(
        'Could not inspect this question’s source. Review its preview before printing.',
      );
    },
  );

  test('regeneration creates a replacement and preserves the original instance', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const first = await api.printableAssessments.create.mutate();
    const original = await selectAssessmentInstanceById(first.assessmentInstanceId);
    const originalQuestions = await api.printableAssessments.questions.query(first);
    const regenerated = await api.printableAssessments.regenerate.mutate(first);
    expect(regenerated.assessmentInstanceId).not.toBe(first.assessmentInstanceId);
    expect(await selectAssessmentInstanceById(first.assessmentInstanceId)).toEqual(original);
    expect(await api.printableAssessments.questions.query(first)).toEqual(originalQuestions);
    expect(await api.printableAssessments.questions.query(regenerated)).toHaveLength(
      originalQuestions.length,
    );
    expect(
      (await selectAssessmentInstanceById(regenerated.assessmentInstanceId)).include_in_statistics,
    ).toBe(false);
  });

  test('does not expose or regenerate another user’s instance or another assessment’s instance', async () => {
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
    const studentInstanceId = await makeAssessmentInstance({
      assessment,
      user_id: otherUser.id,
      authn_user_id: '1',
      mode: 'Public',
      time_limit_min: null,
      date: new Date(),
      client_fingerprint_id: null,
    });
    const api = client(assessment.id);
    expect(
      (await api.printableAssessments.list.query()).some(
        (instance) => instance.id === studentInstanceId,
      ),
    ).toBe(false);
    await expect(
      api.printableAssessments.questions.query({ assessmentInstanceId: studentInstanceId }),
    ).rejects.toThrow('This assessment instance is not available.');
    await expect(
      api.printableAssessments.regenerate.mutate({ assessmentInstanceId: studentInstanceId }),
    ).rejects.toThrow('This assessment instance is not available.');
    await expect(
      api.printableAssessmentExport.pdf.mutate(packetInput(studentInstanceId)),
    ).rejects.toThrow('An assessment instance is not available.');
    const otherForm = await client(otherAssessment.id).printableAssessments.create.mutate();
    await expect(api.printableAssessments.questions.query(otherForm)).rejects.toThrow(
      'This assessment instance is not available.',
    );
    await expect(api.printableAssessments.regenerate.mutate(otherForm)).rejects.toThrow(
      'This assessment instance is not available.',
    );
    await expect(
      api.printableAssessmentExport.pdf.mutate(packetInput(otherForm.assessmentInstanceId)),
    ).rejects.toThrow('An assessment instance is not available.');
  });

  test('ordinary and printable requests share a number sequence under concurrent creation', async () => {
    const assessment = await printAssessment();
    await execute(sql.set_multiple_instance, {
      assessment_id: assessment.id,
      multiple_instance: true,
    });
    try {
      const api = client(assessment.id);
      const ids = await Promise.all(
        Array.from({ length: 6 }, async (_, index) => {
          if (index % 2 === 0) {
            return (await api.printableAssessments.create.mutate()).assessmentInstanceId;
          }
          return await makeAssessmentInstance({
            assessment,
            user_id: '1',
            authn_user_id: '1',
            mode: 'Public',
            time_limit_min: null,
            date: new Date(),
            client_fingerprint_id: null,
          });
        }),
      );
      const instances = await Promise.all(ids.map(selectAssessmentInstanceById));
      const numbers = instances.map((instance) => instance.number).sort((a, b) => a - b);
      expect(numbers).toEqual(Array.from({ length: 6 }, (_, index) => numbers[0] + index));
    } finally {
      await execute(sql.set_multiple_instance, {
        assessment_id: assessment.id,
        multiple_instance: assessment.multiple_instance,
      });
    }
  });

  test('concurrent student requests still reuse a single allowed attempt', async () => {
    const assessment = await printAssessment();
    const user = await getOrCreateUser({
      uid: 'single-attempt@example.com',
      name: 'Single attempt',
      uin: '555555556',
    });
    const ids = await Promise.all(
      Array.from({ length: 3 }, () =>
        makeAssessmentInstance({
          assessment,
          user_id: user.id,
          authn_user_id: user.id,
          mode: 'Public',
          time_limit_min: null,
          date: new Date(),
          client_fingerprint_id: null,
        }),
      ),
    );
    expect(new Set(ids).size).toBe(1);
    expect((await selectAssessmentInstanceById(ids[0])).number).toBe(1);
  });

  test('warns about missing question files', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const instance = await api.printableAssessments.create.mutate();
    const questions = await api.printableAssessments.questions.query(instance);
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
      const inspected = await api.printableAssessments.questions.query(instance);
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
    metadata.instances[0].settings.identityFields = 'Name';
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

  test('rejects invalid custom cover PDFs before rendering', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const instance = await api.printableAssessments.create.mutate();
    const data = packetInput(instance.assessmentInstanceId);
    data.append('coverPages', new File(['invalid PDF'], 'bad.pdf', { type: 'application/pdf' }));
    await expect(api.printableAssessmentExport.pdf.mutate(data)).rejects.toThrow(
      'valid PDF without password protection',
    );
  });

  test('rejects cover PDFs on answer-key-only exports', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const instance = await api.printableAssessments.create.mutate();
    const data = packetInput(instance.assessmentInstanceId, 1, 'answer_key');
    data.append('coverPages', new File(['unused'], 'cover.pdf', { type: 'application/pdf' }));
    await expect(api.printableAssessmentExport.pdf.mutate(data)).rejects.toThrow(
      'Answer key exports do not use uploaded cover pages.',
    );
  });

  test('rejects a predictable page limit before rendering', async () => {
    const assessment = await printAssessment();
    const api = client(assessment.id);
    const instance = await api.printableAssessments.create.mutate();
    const data = packetInput(instance.assessmentInstanceId, 500);
    data.append('pages', new File(['<div class="pagedjs_page"></div>'.repeat(21)], 'large.html'));
    data.append('snapshotIds', 'placeholder');
    await expect(api.printableAssessmentExport.pdf.mutate(data)).rejects.toThrow(
      'The export would exceed 10,000 pages.',
    );
  });

  test('stores a background PDF and streams it only to the owner', async () => {
    const assessment = await printAssessment();
    const pdf = Buffer.from('%PDF-1.4\nbackground export\n');
    const courseInstance = await selectCourseInstanceById('1');
    const jobSequenceId = await storeCompletedPrintExport({
      owner: {
        assessmentId: assessment.id,
        authnUserId: '1',
        courseId: courseInstance.course_id,
        courseInstanceId: '1',
        userId: '1',
      },
      packet: pdf,
      work: {
        document: 'assessment',
        copies: 1,
        filename: 'test-export.pdf',
        snapshots: [
          {
            formLabel: 'A',
            printDocument: 'assessment',
            localPreviewUrl: 'http://localhost/',
            html: '',
            assetScope: {
              courseInstanceId: '1',
              assessmentId: assessment.id,
              assessmentInstanceId: '1',
              instanceQuestionIds: [],
              authnUserId: '1',
              userId: '1',
            },
          },
        ],
        covers: [],
      },
    });
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
      .toBe('Success');
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
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="test-export.pdf"',
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
    const instance = await api.printableAssessments.create.mutate();
    const data = packetInput(instance.assessmentInstanceId);
    const html = '<!doctype html><html data-print-status="ready"></html>';
    const search = new URLSearchParams(printLayoutSearch(DEFAULT_PRINT_SETTINGS));
    search.set('form_label', 'A');
    search.set('document', 'assessment');
    data.append(
      'snapshotIds',
      createPrintSnapshotId(
        {
          assessmentInstanceId: instance.assessmentInstanceId,
          authnUserId: '1',
          search,
          questionListDigest: await getPrintableQuestionListDigest(
            instance.assessmentInstanceId,
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
        const instance = await api.printableAssessments.create.mutate();
        const questions = await api.printableAssessments.questions.query(instance);
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
      `${siteUrl}${getAssessmentTrpcUrl({ courseInstanceId: '1', assessmentId: assessment.id })}/printableAssessments.list`,
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

  test('requires student data edit permission for PDFs containing answer keys', async () => {
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
    const instanceId = await makeAssessmentInstance({
      assessment,
      user_id: instructor.id,
      authn_user_id: instructor.id,
      mode: 'Public',
      time_limit_min: null,
      date: new Date(),
      client_fingerprint_id: null,
      forPrinting: true,
    });
    const trpcUrl = getAssessmentTrpcUrl({ courseInstanceId: '1', assessmentId: assessment.id });
    const headers = {
      'X-TRPC': 'true',
      'X-CSRF-Token': generatePrefixCsrfToken(
        { url: trpcUrl, authn_user_id: instructor.id },
        config.secretKey,
      ),
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=Previewer; pl2_requested_course_instance_role=Student Data Viewer',
    };

    for (const [document, expectedStatus] of [
      ['assessment', 400],
      ['answer_key', 403],
      ['booklet', 403],
    ] as const) {
      const response = await fetch(`${siteUrl}${trpcUrl}/printableAssessmentExport.pdf`, {
        method: 'POST',
        headers,
        body: packetInput(instanceId, 1, document),
      });
      expect(response.status).toBe(expectedStatus);
    }
  });
});
