import * as cheerio from 'cheerio';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import { EnumEnrollmentStatusSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';
import { type AuthUser, getOrCreateUser, withUser } from './utils/auth.js';
import { createEnrollment } from './utils/enrollment-identity.js';
import { enrollUser } from './utils/enrollments.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const apiUrl = `${siteUrl}/pl/api/v1`;
const studentApiUrl = `${apiUrl}/student`;
const courseInstanceUrl = `${siteUrl}/pl/course_instance/1`;

const STUDENT: AuthUser = {
  name: 'Student User',
  uid: 'student@example.com',
  uin: '000000001',
  email: 'student@example.com',
};
const OTHER_STUDENT: AuthUser = {
  name: 'Other Student',
  uid: 'other-student@example.com',
  uin: '000000002',
  email: 'other-student@example.com',
};
const OUTSIDER: AuthUser = {
  name: 'Outsider',
  uid: 'outsider@example.com',
  uin: '000000003',
  email: 'outsider@example.com',
};

const COURSE_INSTANCE_KEYS = [
  'course_instance_id',
  'course_instance_short_name',
  'course_instance_long_name',
  'course_instance_course_id',
  'display_timezone',
  'course_short_name',
  'course_title',
];

const GRADEBOOK_ROW_KEYS = [
  'assessment_id',
  'assessment_instance_id',
  'assessment_label',
  'title',
  'assessment_set_heading',
  'score_perc',
  'score_hidden',
];

async function get(url: string, token?: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (token) headers['Private-Token'] = token;
  if (cookie) headers.Cookie = cookie;
  return await fetch(url, { headers });
}

async function selectEnrollmentStatuses(user: AuthUser) {
  return await sqldb.queryScalars(
    'SELECT e.status FROM enrollments AS e LEFT JOIN users AS u ON (u.id = e.user_id) WHERE u.uid = $uid OR e.pending_uid = $uid',
    { uid: user.uid },
    EnumEnrollmentStatusSchema,
  );
}

describe('Student API', { timeout: 60_000, concurrent: false }, function () {
  let studentToken: string;
  let otherStudentToken: string;
  let outsiderToken: string;
  let staffToken: string;
  let homeworkInstanceId: string;

  const gradebookUrl = `${studentApiUrl}/course_instances/1/gradebook`;
  const courseInstancesUrl = `${studentApiUrl}/course_instances`;

  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  beforeAll(async () => {
    studentToken = await withUser(STUDENT, () => helperClient.generateApiToken(siteUrl));
    otherStudentToken = await withUser(OTHER_STUDENT, () => helperClient.generateApiToken(siteUrl));
    outsiderToken = await withUser(OUTSIDER, () => helperClient.generateApiToken(siteUrl));
    // The default user is an administrator who isn't enrolled.
    staffToken = await helperClient.generateApiToken(siteUrl);

    await enrollUser('1', STUDENT);
    await enrollUser('1', OTHER_STUDENT);
  });

  describe('authentication and authorization', () => {
    test('rejects requests without a token', async () => {
      assert.equal((await get(courseInstancesUrl)).status, 401);
      assert.equal((await get(gradebookUrl)).status, 401);
    });

    test('rejects requests with an invalid token', async () => {
      const res = await get(gradebookUrl, '12345678-1234-1234-1234-1234567890ab');
      assert.equal(res.status, 401);
    });

    test('returns a JSON 404 for an unknown student route', async () => {
      const res = await get(`${studentApiUrl}/course_instances/1/nope`, studentToken);
      assert.equal(res.status, 404);
      assert.include(res.headers.get('content-type'), 'application/json');
    });

    test('returns a JSON error for a nonexistent course instance', async () => {
      const res = await get(`${studentApiUrl}/course_instances/999999/gradebook`, studentToken);
      assert.equal(res.status, 403);
      assert.include(res.headers.get('content-type'), 'application/json');
    });

    test('returns 403 for an unenrolled user and does not enroll them', async () => {
      const res = await get(gradebookUrl, outsiderToken);
      assert.equal(res.status, 403);
      assert.lengthOf(await selectEnrollmentStatuses(OUTSIDER), 0);
    });

    test('returns 403 in exam mode', async () => {
      const cookie = 'pl_test_mode=Exam';
      assert.equal((await get(courseInstancesUrl, studentToken, cookie)).status, 403);
      assert.equal((await get(gradebookUrl, studentToken, cookie)).status, 403);
    });

    test('returns 403 for course staff who are not enrolled', async () => {
      // The instructor API works for this user, but the student API doesn't.
      assert.equal((await get(`${apiUrl}/course_instances/1/gradebook`, staffToken)).status, 200);
      assert.equal((await get(gradebookUrl, staffToken)).status, 403);

      const listRes = await get(courseInstancesUrl, staffToken);
      assert.equal(listRes.status, 200);
      assert.deepEqual(await listRes.json(), []);

      assert.lengthOf(
        await selectEnrollmentStatuses({
          name: config.authName,
          uid: config.authUid!,
          uin: config.authUin,
        }),
        0,
      );
    });

    test('rejects effective user overrides', async () => {
      // We enroll the staff user so that we can check that overrides are
      // rejected even for someone who would otherwise have access.
      await enrollUser('1', {
        name: config.authName,
        uid: config.authUid!,
        uin: config.authUin,
        email: config.authEmail,
      });
      assert.equal((await get(gradebookUrl, staffToken)).status, 200);

      for (const cookie of [
        `pl2_requested_uid=${STUDENT.uid}`,
        'pl2_requested_course_role=None',
        'pl2_requested_course_instance_role=None',
        'pl2_requested_date=2000-01-19T00:00:01Z',
      ]) {
        assert.equal((await get(gradebookUrl, staffToken, cookie)).status, 403, cookie);
        assert.equal((await get(courseInstancesUrl, staffToken, cookie)).status, 403, cookie);
      }
    });

    test('instructor endpoints still reject student tokens', async () => {
      for (const path of [
        '/course_instances/1',
        '/course_instances/1/gradebook',
        '/course_instances/1/assessments',
        '/course_instances/1/assessment_instances/1',
        '/course_instances/1/submissions/1',
        '/course_instances/1/course_instance_access_rules',
        '/course/1/sync',
      ]) {
        assert.equal((await get(apiUrl + path, studentToken)).status, 403, path);
      }
    });
  });

  describe('course instance list', () => {
    test('lists the course instances the student is enrolled in', async () => {
      const res = await get(courseInstancesUrl, studentToken);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.isArray(json);
      const courseInstance = json.find((ci: any) => ci.course_instance_id === '1');
      assert.exists(courseInstance);
      assert.equal(courseInstance.course_instance_short_name, 'Sp15');
      for (const entry of json) {
        assert.hasAllKeys(entry, COURSE_INSTANCE_KEYS);
      }
    });

    test('returns an empty list for a user with no enrollments', async () => {
      const res = await get(courseInstancesUrl, outsiderToken);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), []);
    });

    test('does not list or accept a pending invitation', async () => {
      await getOrCreateUser(OUTSIDER);
      const enrollment = await createEnrollment({
        courseInstance: await selectCourseInstanceById('1'),
        pendingUid: OUTSIDER.uid,
      });
      try {
        const listRes = await get(courseInstancesUrl, outsiderToken);
        assert.equal(listRes.status, 200);
        assert.deepEqual(await listRes.json(), []);

        assert.equal((await get(gradebookUrl, outsiderToken)).status, 403);

        assert.deepEqual(await selectEnrollmentStatuses(OUTSIDER), ['invited']);
      } finally {
        await sqldb.execute('DELETE FROM enrollments WHERE id = $id', { id: enrollment.id });
      }
    });

    test('does not list or allow access to a blocked enrollment', async () => {
      await sqldb.execute(
        "UPDATE enrollments AS e SET status = 'blocked' FROM users AS u WHERE u.id = e.user_id AND u.uid = $uid",
        { uid: OTHER_STUDENT.uid },
      );
      try {
        const listRes = await get(courseInstancesUrl, otherStudentToken);
        assert.equal(listRes.status, 200);
        assert.deepEqual(await listRes.json(), []);

        assert.equal((await get(gradebookUrl, otherStudentToken)).status, 403);
        assert.deepEqual(await selectEnrollmentStatuses(OTHER_STUDENT), ['blocked']);
      } finally {
        await sqldb.execute(
          "UPDATE enrollments AS e SET status = 'joined' FROM users AS u WHERE u.id = e.user_id AND u.uid = $uid",
          { uid: OTHER_STUDENT.uid },
        );
      }
      assert.equal((await get(gradebookUrl, otherStudentToken)).status, 200);
    });

    test('does not list a course instance whose access has ended', async () => {
      await sqldb.execute(
        "UPDATE course_instances SET publishing_end_date = NOW() - INTERVAL '1 day' WHERE id = 1",
      );
      try {
        const listRes = await get(courseInstancesUrl, studentToken);
        assert.equal(listRes.status, 200);
        const json = await listRes.json();
        assert.notExists(json.find((ci: any) => ci.course_instance_id === '1'));

        assert.equal((await get(gradebookUrl, studentToken)).status, 403);
      } finally {
        await sqldb.execute(
          "UPDATE course_instances SET publishing_end_date = '2400-05-13T23:59:59Z' WHERE id = 1",
        );
      }
      assert.equal((await get(gradebookUrl, studentToken)).status, 200);
    });
  });

  describe('gradebook', () => {
    test('is empty before the student has any assessment instances', async () => {
      const res = await get(gradebookUrl, studentToken);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), []);
    });

    test("returns the student's own gradebook rows", async () => {
      const homework = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'hw1-automaticTestSuite',
      });
      // Visiting a homework creates an assessment instance.
      const pageRes = await withUser(STUDENT, () =>
        fetch(`${courseInstanceUrl}/assessment/${homework.id}/`),
      );
      assert.isTrue(pageRes.ok);

      const res = await get(gradebookUrl, studentToken);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.lengthOf(json, 1);
      assert.hasAllKeys(json[0], GRADEBOOK_ROW_KEYS);
      assert.equal(json[0].assessment_id, homework.id);
      assert.equal(json[0].assessment_label, 'HW1');
      assert.equal(json[0].title, 'Homework for automatic test suite');
      assert.equal(json[0].assessment_set_heading, 'Homeworks');
      assert.equal(json[0].score_perc, 0);
      assert.isFalse(json[0].score_hidden);

      homeworkInstanceId = json[0].assessment_instance_id;
      const owner = await sqldb.queryScalar(
        'SELECT u.uid FROM assessment_instances AS ai JOIN users AS u ON (u.id = ai.user_id) WHERE ai.id = $id',
        { id: homeworkInstanceId },
        z.string(),
      );
      assert.equal(owner, STUDENT.uid);
    });

    test("does not include another student's assessment instances", async () => {
      const res = await get(gradebookUrl, otherStudentToken);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), []);
    });

    test('ignores a user ID supplied by the client', async () => {
      const student = await getOrCreateUser(STUDENT);
      const res = await get(
        `${gradebookUrl}?user_id=${student.id}&uid=${encodeURIComponent(STUDENT.uid)}`,
        otherStudentToken,
      );
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), []);
    });

    test('hides the score when the instructor hides closed assessment scores', async () => {
      const exam = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam9-disableRealTimeGradingWithholdGrades',
      });
      const examUrl = `${courseInstanceUrl}/assessment/${exam.id}/`;

      const assessmentInstanceId = await withUser(STUDENT, async () => {
        const startPage = await helperClient.fetchCheerio(examUrl);
        assert.isTrue(startPage.ok);
        const startRes = await fetch(examUrl, {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'new_instance',
            __csrf_token: helperClient.getCSRFToken(startPage.$('form')),
          }),
        });
        assert.isTrue(startRes.ok);
        return String(helperClient.parseAssessmentInstanceId(startRes.url));
      });

      // While the exam is open, the row is visible and the score isn't hidden.
      let json = await (await get(gradebookUrl, studentToken)).json();
      let row = json.find((r: any) => r.assessment_instance_id === assessmentInstanceId);
      assert.exists(row);
      assert.equal(row.assessment_label, 'E9');
      assert.isFalse(row.score_hidden);

      // Give the instance a nonzero score so that we can tell `null` apart
      // from a real score, then close it.
      await sqldb.execute(
        'UPDATE assessment_instances SET open = FALSE, closed_at = NOW(), score_perc = 50, points = 5 WHERE id = $id',
        { id: assessmentInstanceId },
      );

      json = await (await get(gradebookUrl, studentToken)).json();
      row = json.find((r: any) => r.assessment_instance_id === assessmentInstanceId);
      assert.exists(row);
      assert.hasAllKeys(row, GRADEBOOK_ROW_KEYS);
      assert.isNull(row.score_perc);
      assert.isTrue(row.score_hidden);

      // The homework score is still visible.
      const homeworkRow = json.find((r: any) => r.assessment_instance_id === homeworkInstanceId);
      assert.isFalse(homeworkRow.score_hidden);
      assert.equal(homeworkRow.score_perc, 0);
    });

    test('matches the student gradebook page', async () => {
      const json = await (await get(gradebookUrl, studentToken)).json();

      const page = await withUser(STUDENT, () => fetch(`${courseInstanceUrl}/gradebook`));
      assert.isTrue(page.ok);
      const $ = cheerio.load(await page.text());
      const pageRows = $('table tbody tr').filter((_, tr) => $(tr).find('td').length > 0);

      assert.lengthOf(json, 2);
      assert.equal(pageRows.length, json.length);
      for (const row of json) {
        const pageRow = pageRows.filter((_, tr) => $(tr).text().includes(row.title));
        assert.lengthOf(pageRow, 1, row.title);
        assert.equal(pageRow.text().includes('Score not shown'), row.score_hidden, row.title);
      }
    });

    test('all IDs are strings', async () => {
      const json = await (await get(gradebookUrl, studentToken)).json();
      for (const row of json) {
        assert.isTrue(IdSchema.safeParse(row.assessment_id).success);
        assert.isTrue(IdSchema.safeParse(row.assessment_instance_id).success);
        assert.isString(row.assessment_id);
        assert.isString(row.assessment_instance_id);
      }
    });
  });
});
