import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { config } from '../lib/config.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceByShortName } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';

import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const fileUrl = (path: string) => `${siteUrl}/pl/course/1/course_agent/file/${path}`;

async function redirectTarget(path: string) {
  const response = await fetch(fileUrl(path), { redirect: 'manual' });
  expect(response.status).toBe(302);
  return new URL(response.headers.get('location')!, siteUrl).pathname;
}

describe('Course agent file links', { timeout: 30_000 }, () => {
  const originalIsEnterprise = config.isEnterprise;
  let question: string;
  let nestedQuestion: string;
  let instance: string;
  let assessment: string;

  beforeAll(async () => {
    // The route is mounted only in enterprise builds, when the server starts.
    config.isEnterprise = true;
    await helperServer.before()();
    const course = await selectCourseById('1');
    question = `/pl/course/1/question/${(await selectQuestionByQid({ qid: 'addNumbers', course_id: '1' })).id}`;
    nestedQuestion = `/pl/course/1/question/${(await selectQuestionByQid({ qid: 'manualGrade/codeUpload', course_id: '1' })).id}`;
    const courseInstance = await selectCourseInstanceByShortName({ course, shortName: 'Sp15' });
    instance = `/pl/course_instance/${courseInstance.id}/instructor`;
    const { id } = await selectAssessmentByTid({
      course_instance_id: courseInstance.id,
      tid: 'exam1-automaticTestSuite',
    });
    assessment = `${instance}/assessment/${id}`;
  });
  afterAll(helperServer.after);
  afterAll(() => {
    config.isEnterprise = originalIsEnterprise;
  });

  test('opens each kind of course file on its page', async () => {
    const cases = {
      'questions/addNumbers/question.html': `${question}/preview`,
      'questions/addNumbers/server.py': `${question}/file_view/questions/addNumbers/server.py`,
      'questions/manualGrade/codeUpload/info.json': `${nestedQuestion}/settings`,
      'courseInstances/Sp15/infoCourseInstance.json': `${instance}/instance_admin/settings`,
      'courseInstances/Sp15/clientFilesCourseInstance/data.txt': `${instance}/instance_admin/file_view/courseInstances/Sp15/clientFilesCourseInstance/data.txt`,
      'courseInstances/Sp15/assessments/exam1-automaticTestSuite/infoAssessment.json': `${assessment}/settings`,
      'courseInstances/Sp15/assessments/exam1-automaticTestSuite': `${assessment}/questions`,
      'infoCourse.json': '/pl/course/1/course_admin/settings',
      elements: '/pl/course/1/course_admin/file_view/elements',
      '.git/config': '/pl/course/1/course_admin/file_view',
    };
    const targets: Record<string, string> = {};
    for (const path of Object.keys(cases)) targets[path] = await redirectTarget(path);
    expect(targets).toEqual(cases);
  });

  test('explains when a file is not in the course and opens the closest page', async () => {
    const cases = {
      'courseInstances/Sp27/infoCourseInstance.json': '/pl/course/1/course_admin/instances',
      'questions/newQuestion/info.json': '/pl/course/1/course_admin/questions',
      'courseInstances/Sp15/assessments/newExam/infoAssessment.json': `${instance}/instance_admin/assessments`,
      'questions/addNumbers/new.py': `${question}/preview`,
      'questions/..%2F..%2F..%2Fetc/passwd': '/pl/course/1/course_admin/file_view',
    };
    const targets: Record<string, string> = {};
    for (const path of Object.keys(cases)) targets[path] = await redirectTarget(path);
    expect(targets).toEqual(cases);

    const response = await fetch(fileUrl('courseInstances/Sp27/infoCourseInstance.json'), {
      redirect: 'manual',
    });
    const page = await fetch(new URL(response.headers.get('location')!, siteUrl), {
      headers: { cookie: response.headers.getSetCookie().join('; ') },
    });
    expect(await page.text()).toContain('That file is not in the course.');
  });

  test('requires course preview access', async () => {
    const student = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student',
      uin: 'student',
    });
    const response = await withUser(student, () =>
      fetch(fileUrl('infoCourse.json'), { redirect: 'manual' }),
    );
    expect(response.status).toBe(403);
  });
});
