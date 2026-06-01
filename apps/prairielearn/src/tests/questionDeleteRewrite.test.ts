import * as path from 'path';

import { execa } from 'execa';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { config } from '../lib/config.js';
import { getCourseFilesClient } from '../lib/course-files-api.js';
import { generateCsrfToken } from '../middlewares/csrfToken.js';
import { selectQuestionByQid } from '../models/question.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1/instructor';

const COURSE_ID = '1';
const COURSE_INSTANCE_SHORT_NAME = 'Fa18';
const QUESTION_HTML = 'This is a test question.\n';

const TARGET_QID = 'target';
const OTHER_QID = 'other';

const DIRECT_AID = 'direct';
const MIXED_ALT_AID = 'mixed-alt';
const ONLY_ALT_AID = 'only-alt';

async function populateOrigin(originDir: string) {
  await fs.ensureDir(originDir);
  await fs.writeJSON(path.join(originDir, 'infoCourse.json'), {
    uuid: '01234567-89ab-cdef-0123-456789abcdef',
    name: 'TEST 101',
    title: 'Test Course',
    topics: [{ name: 'Test', color: 'gray3', description: 'Test topic' }],
  });

  for (const [qid, uuid] of [
    [TARGET_QID, '11111111-1111-1111-1111-111111111111'],
    [OTHER_QID, '22222222-2222-2222-2222-222222222222'],
  ] as const) {
    const qDir = path.join(originDir, 'questions', qid);
    await fs.ensureDir(qDir);
    await fs.writeJSON(path.join(qDir, 'info.json'), {
      uuid,
      title: qid,
      topic: 'Test',
      type: 'v3',
    });
    await fs.writeFile(path.join(qDir, 'question.html'), QUESTION_HTML);
  }

  const ciDir = path.join(originDir, 'courseInstances', COURSE_INSTANCE_SHORT_NAME);
  await fs.ensureDir(ciDir);
  await fs.writeJSON(path.join(ciDir, 'infoCourseInstance.json'), {
    uuid: '6d65eff5-b7c6-4b8f-bc18-ab5e7cbea2fa',
    longName: 'Fall 2018',
    allowAccess: [
      { institution: 'Any', startDate: '1900-01-19T00:00:01', endDate: '2400-05-13T23:59:59' },
    ],
  });

  const assessments: Record<string, object> = {
    [DIRECT_AID]: {
      uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      type: 'Homework',
      title: 'Direct reference assessment',
      set: 'Homework',
      number: '1',
      allowAccess: [{ credit: 100 }],
      zones: [
        {
          title: 'zone',
          questions: [
            { id: TARGET_QID, points: 10 },
            { id: OTHER_QID, points: 5 },
          ],
        },
      ],
    },
    [MIXED_ALT_AID]: {
      uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      type: 'Homework',
      title: 'Alternative group assessment (mixed)',
      set: 'Homework',
      number: '2',
      allowAccess: [{ credit: 100 }],
      zones: [
        {
          title: 'zone',
          questions: [
            {
              points: 10,
              alternatives: [{ id: TARGET_QID }, { id: OTHER_QID }],
            },
          ],
        },
      ],
    },
    [ONLY_ALT_AID]: {
      uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
      type: 'Homework',
      title: 'Alternative group assessment (target only)',
      set: 'Homework',
      number: '3',
      allowAccess: [{ credit: 100 }],
      zones: [
        {
          title: 'zone-target',
          questions: [{ points: 10, alternatives: [{ id: TARGET_QID }] }],
        },
        {
          title: 'zone-other',
          questions: [{ id: OTHER_QID, points: 5 }],
        },
      ],
    },
  };

  for (const [aid, body] of Object.entries(assessments)) {
    const aDir = path.join(ciDir, 'assessments', aid);
    await fs.ensureDir(aDir);
    await fs.writeJSON(path.join(aDir, 'infoAssessment.json'), body);
  }
}

let courseRepo: CourseRepoFixture;

describe('QuestionDeleteEditor rewrites infoAssessment.json', { timeout: 20_000 }, () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture({ populateOrigin });
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: COURSE_ID, repository: courseRepo.courseOriginDir });
  });

  afterAll(helperServer.after);

  it('removes the deleted qid from every referencing assessment', async () => {
    const targetQuestion = await selectQuestionByQid({ qid: TARGET_QID, course_id: COURSE_ID });

    const settingsPath = `/pl/course_instance/1/instructor/question/${targetQuestion.id}/settings`;
    const csrfToken = generateCsrfToken({ url: settingsPath, authnUserId: '1' });

    const postUrl = `${courseInstanceUrl}/question/${targetQuestion.id}/settings`;
    const res = await fetch(postUrl, {
      method: 'POST',
      body: new URLSearchParams({ __csrf_token: csrfToken, __action: 'delete_question' }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    assert.isOk(res.ok);
    assert.notInclude(res.url, '/edit_error/');

    await execa('git', ['pull'], { cwd: courseRepo.courseDevDir, env: process.env });

    const assessmentsDir = path.join(
      courseRepo.courseDevDir,
      'courseInstances',
      COURSE_INSTANCE_SHORT_NAME,
      'assessments',
    );

    const directJson = await fs.readJson(
      path.join(assessmentsDir, DIRECT_AID, 'infoAssessment.json'),
    );
    assert.deepEqual(directJson.zones, [
      { title: 'zone', questions: [{ id: OTHER_QID, points: 5 }] },
    ]);

    const mixedJson = await fs.readJson(
      path.join(assessmentsDir, MIXED_ALT_AID, 'infoAssessment.json'),
    );
    assert.deepEqual(mixedJson.zones, [
      { title: 'zone', questions: [{ points: 10, alternatives: [{ id: OTHER_QID }] }] },
    ]);

    const onlyAltJson = await fs.readJson(
      path.join(assessmentsDir, ONLY_ALT_AID, 'infoAssessment.json'),
    );
    assert.deepEqual(onlyAltJson.zones, [
      { title: 'zone-other', questions: [{ id: OTHER_QID, points: 5 }] },
    ]);

    assert.isFalse(
      await fs.pathExists(path.join(courseRepo.courseDevDir, 'questions', TARGET_QID)),
    );
    assert.isTrue(await fs.pathExists(path.join(courseRepo.courseDevDir, 'questions', OTHER_QID)));
  });

  it('bulk deletion that empties referencing assessments succeeds and repairs them', async () => {
    // After the previous test, `other` is the only remaining reference in each
    // assessment, so deleting it empties every zone. Same-course deletions are
    // no longer blocked: the emptied zones are dropped and the deletion proceeds.
    const otherQuestion = await selectQuestionByQid({ qid: OTHER_QID, course_id: COURSE_ID });

    const result = await getCourseFilesClient().batchDeleteQuestions.mutate({
      course_id: COURSE_ID,
      user_id: '1',
      authn_user_id: '1',
      has_course_permission_edit: true,
      question_ids: [otherQuestion.id],
    });

    assert.equal(result.status, 'success');

    await execa('git', ['pull'], { cwd: courseRepo.courseDevDir, env: process.env });

    const assessmentsDir = path.join(
      courseRepo.courseDevDir,
      'courseInstances',
      COURSE_INSTANCE_SHORT_NAME,
      'assessments',
    );

    for (const aid of [DIRECT_AID, MIXED_ALT_AID, ONLY_ALT_AID]) {
      const json = await fs.readJson(path.join(assessmentsDir, aid, 'infoAssessment.json'));
      assert.deepEqual(json.zones, []);
    }

    assert.isFalse(await fs.pathExists(path.join(courseRepo.courseDevDir, 'questions', OTHER_QID)));
  });
});
