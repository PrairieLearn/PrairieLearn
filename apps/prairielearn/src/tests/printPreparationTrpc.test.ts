import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { makeAssessmentInstance } from '../lib/assessment.js';
import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;

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

describe('print preparation', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  test('creates and reuses an instructor form without affecting student statistics', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam20-assessmentTools',
    });
    const api = client(assessment.id);
    const first = await api.printableExams.create.mutate();
    const second = await api.printableExams.create.mutate();
    expect(second).toEqual(first);
    const instance = await selectAssessmentInstanceById(first.assessmentInstanceId);
    expect(instance.user_id).toBe('1');
    expect(instance.include_in_statistics).toBe(false);
    const questions = await api.printableExams.questions.query(first);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0].number).toBe('1');
    expect(questions.flatMap((question) => question.concerns)).not.toContain(
      'Could not inspect this question’s source. Review its preview before printing.',
    );
  });

  test('does not expose another user’s form or another assessment’s questions', async () => {
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
    ).rejects.toThrow('This exam form is not available.');
    const otherForm = await client(otherAssessment.id).printableExams.create.mutate();
    await expect(api.printableExams.questions.query(otherForm)).rejects.toThrow(
      'This exam form is not available.',
    );
  });

  test('rejects homework assessments', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw1-automaticTestSuite',
    });
    await expect(client(assessment.id).printableExams.create.mutate()).rejects.toThrow(
      'Only exams can be printed.',
    );
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
  });
});
