import fs from 'node:fs/promises';
import path from 'node:path';

import * as tmp from 'tmp-promise';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { makeAssessmentInstance } from '../lib/assessment.js';
import { getRuntimeDirectoryForCourse } from '../lib/chunks.js';
import { DEFAULT_PRINT_SETTINGS } from '../lib/client/print-preparation.js';
import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { PrintPacketMetadataSchema } from '../lib/print-packet-schema.js';
import {
  assessmentHasPrintRandomization,
  inspectPrintPreparationQuestions,
} from '../lib/print-preparation.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentById, selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseById } from '../models/course.js';
import { selectQuestionById } from '../models/question.js';
import { selectVariantsByInstanceQuestion } from '../models/variant.js';
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

function packetInput(assessmentInstanceId: string, copies = 1) {
  const data = new FormData();
  data.set(
    'metadata',
    JSON.stringify({
      instances: [{ assessmentInstanceId, formLabel: 'A', settings: DEFAULT_PRINT_SETTINGS }],
      copies,
      document: 'exam',
    }),
  );
  return data;
}

describe('print preparation', { timeout: 60_000 }, () => {
  let courseDirectory: tmp.DirectoryResult;
  beforeAll(async () => {
    // File-error tests must not modify the course used by other test workers.
    courseDirectory = await tmp.dir({ unsafeCleanup: true });
    await fs.cp(TEST_COURSE_PATH, courseDirectory.path, { recursive: true });
    await helperServer.before(courseDirectory.path)();
  });
  afterAll(async () => {
    await helperServer.after();
    await courseDirectory.cleanup();
  });

  test.each(['exam20-assessmentTools', 'hw1-automaticTestSuite'])(
    'creates independent instructor instances even when students only get one attempt (%s)',
    async (tid) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid,
      });
      const api = client(assessment.id);
      expect(assessment.multiple_instance).toBe(false);
      const first = await api.printableExams.create.mutate();
      const second = await api.printableExams.create.mutate();
      expect(second.assessmentInstanceId).not.toBe(first.assessmentInstanceId);
      const instance = await selectAssessmentInstanceById(first.assessmentInstanceId);
      const secondInstance = await selectAssessmentInstanceById(second.assessmentInstanceId);
      expect(instance.user_id).toBe('1');
      expect(instance.include_in_statistics).toBe(false);
      expect(instance.auto_close).toBe(false);
      expect(secondInstance.number).toBe(instance.number + 1);
      expect(secondInstance.include_in_statistics).toBe(false);
      expect((await selectAssessmentById(assessment.id)).multiple_instance).toBe(false);
      const questions = await api.printableExams.questions.query(first);
      expect(questions.length).toBeGreaterThan(0);
      expect(questions[0].number).toBe(assessment.type === 'Homework' ? 'HW1.1' : '1');
      expect(questions.flatMap((question) => question.concerns)).not.toContain(
        'Could not inspect this question’s source. Review its preview before printing.',
      );
    },
  );

  test.each(['exam20-assessmentTools', 'hw1-automaticTestSuite'])(
    'regeneration creates a replacement and preserves the original instance (%s)',
    async (tid) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid,
      });
      const api = client(assessment.id);
      const first = await api.printableExams.create.mutate();
      const original = await selectAssessmentInstanceById(first.assessmentInstanceId);
      const originalQuestions = await api.printableExams.questions.query(first);
      const regenerated = await api.printableExams.regenerate.mutate(first);
      expect(regenerated.assessmentInstanceId).not.toBe(first.assessmentInstanceId);
      expect(await selectAssessmentInstanceById(first.assessmentInstanceId)).toEqual(original);
      expect(await api.printableExams.questions.query(first)).toEqual(originalQuestions);
      expect(await api.printableExams.questions.query(regenerated)).toHaveLength(
        originalQuestions.length,
      );
      expect(
        (await selectAssessmentInstanceById(regenerated.assessmentInstanceId))
          .include_in_statistics,
      ).toBe(false);
    },
  );

  test('does not expose or regenerate another user’s instance or another assessment’s instance', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam20-assessmentTools',
    });
    const otherAssessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam1-automaticTestSuite',
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
      (await api.printableExams.list.query()).some((instance) => instance.id === studentInstanceId),
    ).toBe(false);
    await expect(
      api.printableExams.questions.query({ assessmentInstanceId: studentInstanceId }),
    ).rejects.toThrow('This assessment instance is not available.');
    await expect(
      api.printableExams.regenerate.mutate({ assessmentInstanceId: studentInstanceId }),
    ).rejects.toThrow('This assessment instance is not available.');
    await expect(
      api.printableExamExport.pdf.mutate(packetInput(studentInstanceId)),
    ).rejects.toThrow('An assessment instance is not available.');
    const otherForm = await client(otherAssessment.id).printableExams.create.mutate();
    await expect(api.printableExams.questions.query(otherForm)).rejects.toThrow(
      'This assessment instance is not available.',
    );
    await expect(api.printableExams.regenerate.mutate(otherForm)).rejects.toThrow(
      'This assessment instance is not available.',
    );
    await expect(
      api.printableExamExport.pdf.mutate(packetInput(otherForm.assessmentInstanceId)),
    ).rejects.toThrow('An assessment instance is not available.');
  });

  test('ordinary and printable requests share a number sequence under concurrent creation', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam20-assessmentTools',
    });
    await execute(sql.set_multiple_instance, {
      assessment_id: assessment.id,
      multiple_instance: true,
    });
    try {
      const api = client(assessment.id);
      const ids = await Promise.all(
        Array.from({ length: 6 }, async (_, index) => {
          if (index % 2 === 0) {
            return (await api.printableExams.create.mutate()).assessmentInstanceId;
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

  test.each(['exam20-assessmentTools', 'hw1-automaticTestSuite'])(
    'concurrent student requests still reuse a single allowed attempt (%s)',
    async (tid) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid,
      });
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
    },
  );

  test('warns about missing question files but propagates unexpected inspection failures', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam20-assessmentTools',
    });
    const api = client(assessment.id);
    const instance = await api.printableExams.create.mutate();
    const questions = await api.printableExams.questions.query(instance);
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
      const inspected = await api.printableExams.questions.query(instance);
      expect(inspected[0].concerns).toContain(
        'Could not inspect this question’s source. Review its preview before printing.',
      );
      expect(inspected).toHaveLength(questions.length);
      await fs.mkdir(filename);
      await expect(
        inspectPrintPreparationQuestions(instance.assessmentInstanceId),
      ).rejects.toMatchObject({ code: 'EISDIR' });
    } finally {
      await fs.rm(filename, { recursive: true, force: true });
      await fs.writeFile(filename, original);
    }
  });

  test.each(['Name', 'Section\nsection', 'x'.repeat(41)])(
    'returns actionable errors for invalid cover labels: %s',
    async (identityFields) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam20-assessmentTools',
      });
      const input = packetInput('1');
      const metadata = PrintPacketMetadataSchema.parse(
        JSON.parse(input.get('metadata')!.toString()),
      );
      metadata.instances[0].settings.identityFields = identityFields;
      input.set('metadata', JSON.stringify(metadata));
      await expect(client(assessment.id).printableExamExport.pdf.mutate(input)).rejects.toThrow(
        /Name and Date|different label|40 characters/,
      );
    },
  );

  test('validates packet export settings before rendering', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam20-assessmentTools',
    });
    await expect(
      client(assessment.id).printableExamExport.pdf.mutate(packetInput('1', 0)),
    ).rejects.toThrow('Invalid print export settings.');
  });

  test('rejects invalid custom cover PDFs before rendering', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam20-assessmentTools',
    });
    const api = client(assessment.id);
    const instance = await api.printableExams.create.mutate();
    const data = packetInput(instance.assessmentInstanceId);
    data.append('coverPages', new File(['invalid PDF'], 'bad.pdf', { type: 'application/pdf' }));
    await expect(api.printableExamExport.pdf.mutate(data)).rejects.toThrow(
      'valid PDF without password protection',
    );
  });

  test('reports exams with questions that support multiple variants', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam20-assessmentTools',
    });
    expect(await assessmentHasPrintRandomization(assessment.id)).toBe(true);
  });

  test.each([
    ['question order', sql.enable_shuffle],
    ['zone selection', sql.enable_zone_selection],
    ['alternative selection', sql.enable_alternative_selection],
  ])('detects randomized %s even when all question variants are fixed', async (_, query) => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam20-assessmentTools',
    });
    await runInTransactionAndRollback(async () => {
      await execute(sql.set_static_assessment, { assessment_id: assessment.id });
      expect(await assessmentHasPrintRandomization(assessment.id)).toBe(false);
      await execute(query, { assessment_id: assessment.id });
      expect(await assessmentHasPrintRandomization(assessment.id)).toBe(true);
    });
  });

  test.each([1, 100])(
    'treats choose-all pools (%s) as static when variants and order are fixed',
    async (numberChoose) => {
      const assessment = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam20-assessmentTools',
      });
      await runInTransactionAndRollback(async () => {
        await execute(sql.set_static_assessment, { assessment_id: assessment.id });
        // Both zones and alternative groups in this assessment contain exactly one question.
        await execute(sql.choose_all_questions, {
          assessment_id: assessment.id,
          number_choose: numberChoose,
        });
        expect(await assessmentHasPrintRandomization(assessment.id)).toBe(false);
      });
    },
  );

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
        const instance = await api.printableExams.create.mutate();
        const questions = await api.printableExams.questions.query(instance);
        expect(questions).toHaveLength(2);
        expect(questions[0].number).toMatch(shuffle ? /^#\d+$/ : /^HW15\.1$/);
        const search = new URLSearchParams({
          paper_size: 'Letter',
          question_block_size: `${questions[0].number}:half`,
          exclude_question: questions[1].number,
        });
        const preview = await fetch(
          `${siteUrl}/pl/course_instance/1/instructor/assessment_instance/${instance.assessmentInstanceId}/paper/preview?${search}`,
        );
        expect(preview.status).toBe(200);
        const html = await preview.text();
        expect(html).toContain('data-print-question-count="1"');
        expect(html).toContain(`data-question-number="${questions[0].number}"`);
        expect(html).toContain('data-print-block-size="half"');
        expect(html).not.toContain(`data-question-number="${questions[1].number}"`);
      } finally {
        await execute(sql.set_shuffle_questions, {
          assessment_id: assessment.id,
          shuffle_questions: assessment.shuffle_questions,
        });
      }
    },
  );

  test('printing homework reuses closed variants for student copies and answer keys', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw20-afterCompleteVisibility',
    });
    const { assessmentInstanceId } = await client(assessment.id).printableExams.create.mutate();
    const paperUrl = `${siteUrl}/pl/course_instance/1/instructor/assessment_instance/${assessmentInstanceId}/paper`;
    const firstPreview = await fetch(`${paperUrl}/preview?paper_size=Letter`);
    expect(firstPreview.status).toBe(200);
    expect(await firstPreview.text()).toContain('data-print-warnings="[]"');
    const variants = await selectVariantsByInstanceQuestion({
      assessment_instance_id: assessmentInstanceId,
    });
    expect(variants).toHaveLength(1);
    await execute(sql.close_variants, { assessment_instance_id: assessmentInstanceId });
    for (const document of ['exam', 'answer_key', 'exam']) {
      const preview = await fetch(`${paperUrl}/preview?paper_size=Letter&document=${document}`);
      expect(preview.status).toBe(200);
      const html = await preview.text();
      expect(html).toContain('data-print-question-count="1"');
      expect(html).toContain('data-print-omitted-question-count="0"');
      expect(
        await selectVariantsByInstanceQuestion({
          assessment_instance_id: assessmentInstanceId,
        }),
      ).toEqual(variants.map((variant) => ({ ...variant, open: false })));
    }
  });

  test('requires course preview permission', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam20-assessmentTools',
    });
    const response = await fetch(
      `${siteUrl}${getAssessmentTrpcUrl({ courseInstanceId: '1', assessmentId: assessment.id })}/printableExams.list`,
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
    const exportResponse = await fetch(`${siteUrl}${trpcUrl}/printableExamExport.pdf`, {
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
