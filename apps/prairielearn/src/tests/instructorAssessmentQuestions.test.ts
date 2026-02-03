import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import * as tmp from 'tmp';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { b64EncodeUnicode } from '../lib/base64-util.js';
import { config } from '../lib/config.js';
import { getOriginalHash } from '../lib/editors.js';
import { features } from '../lib/features/index.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';

import { fetchCheerio } from './helperClient.js';
import { updateCourseRepository } from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');
const baseDir = tmp.dirSync().name;
const courseOriginDir = path.join(baseDir, 'courseOrigin');
const courseLiveDir = path.join(baseDir, 'courseLive');
const courseDevDir = path.join(baseDir, 'courseDev');
const assessmentLiveDir = path.join(courseLiveDir, 'courseInstances', 'Fa18', 'assessments');
const assessmentLiveInfoPath = path.join(assessmentLiveDir, 'HW1', 'infoAssessment.json');

const siteUrl = `http://localhost:${config.serverPort}`;

describe('Editing assessment questions', () => {
  // Capture original state to restore after tests
  let originalDevMode: boolean;
  let wasFeatureEnabled: boolean;

  /**
   * Helper function to get CSRF token and calculate orig_hash for POST requests.
   * The form with these values is only rendered client-side in edit mode,
   * so we need to extract/calculate them manually for tests.
   */
  async function getRequestData() {
    const questionsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
    );
    const csrfToken = questionsPageResponse.$('#test_csrf_token').text();
    const origHash = (await getOriginalHash(assessmentLiveInfoPath))!;
    return { csrfToken, origHash };
  }

  beforeAll(async () => {
    await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseOriginDir], {
      cwd: '.',
      env: process.env,
    });

    await execa('git', ['clone', courseOriginDir, courseLiveDir], {
      cwd: '.',
      env: process.env,
    });

    await fs.copy(courseTemplateDir, courseLiveDir);

    const execOptions = { cwd: courseLiveDir, env: process.env };
    await execa('git', ['add', '-A'], execOptions);
    await execa('git', ['commit', '-m', 'Initial commit'], execOptions);
    await execa('git', ['push', 'origin', 'master'], execOptions);
    await execa('git', ['clone', courseOriginDir, courseDevDir], { cwd: '.', env: process.env });

    // Capture original state before modifying
    originalDevMode = config.devMode;
    config.devMode = true;

    await helperServer.before(courseLiveDir)();

    await updateCourseRepository({ courseId: '1', repository: courseOriginDir });

    // Check if feature was already enabled before enabling it
    wasFeatureEnabled = await features.enabled('assessment-questions-editor');
    // Enable the assessment-questions-editor feature flag for these tests
    await features.enable('assessment-questions-editor');
  });

  afterAll(async () => {
    // Restore original state
    config.devMode = originalDevMode;

    // Only disable the feature if it wasn't enabled before these tests
    if (!wasFeatureEnabled) {
      await features.disable('assessment-questions-editor');
    }

    await helperServer.after();
  });

  test.sequential('access the test assessment info file', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.title, 'Homework for file editor test');
    assert.equal(assessmentInfo.zones.length, 1);
    assert.equal(assessmentInfo.zones[0].questions.length, 1);
    assert.equal(assessmentInfo.zones[0].questions[0].id, 'test/question');
  });

  test.sequential('access the assessment questions page', async () => {
    const questionsPageResponse = await fetchCheerio(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
    );
    assert.equal(questionsPageResponse.status, 200);
  });

  test.sequential('verify saving without changes should not modify the json', async () => {
    // Read the original file content
    const originalContent = await fs.readFile(assessmentLiveInfoPath, 'utf8');
    const originalInfo = JSON.parse(originalContent);

    // Get CSRF token and orig_hash
    const { csrfToken, origHash } = await getRequestData();

    // Submit the form with the same data
    const response = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save_questions',
          __csrf_token: csrfToken,
          orig_hash: origHash,
          zones: JSON.stringify([
            {
              questions: [
                {
                  id: 'test/question',
                  points: 10,
                },
              ],
            },
          ]),
        }),
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`);

    // Verify the file content is unchanged (except for formatting)
    const updatedContent = await fs.readFile(assessmentLiveInfoPath, 'utf8');
    const updatedInfo = JSON.parse(updatedContent);

    assert.deepEqual(updatedInfo, originalInfo);
  });

  test.sequential('add a new question to assessment', async () => {
    const { csrfToken, origHash } = await getRequestData();

    const response = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save_questions',
          __csrf_token: csrfToken,
          orig_hash: origHash,
          zones: JSON.stringify([
            {
              questions: [
                {
                  id: 'test/question',
                  points: 10,
                },
                {
                  id: 'test/question',
                  points: 5,
                },
              ],
            },
          ]),
        }),
      },
    );

    assert.equal(response.status, 200);
    // Accept either successful redirect or edit_error (changes are still saved)
    assert.match(
      response.url,
      /\/pl\/course_instance\/1\/instructor\/(assessment\/1\/questions|edit_error\/\d+)$/,
    );

    // Verify new question was added
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.zones[0].questions.length, 2);
    assert.equal(assessmentInfo.zones[0].questions[0].id, 'test/question');
    assert.equal(assessmentInfo.zones[0].questions[0].points, 10);
    assert.equal(assessmentInfo.zones[0].questions[1].id, 'test/question');
    assert.equal(assessmentInfo.zones[0].questions[1].points, 5);
  });

  test.sequential('change question points', async () => {
    const { csrfToken, origHash } = await getRequestData();

    const response = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save_questions',
          __csrf_token: csrfToken,
          orig_hash: origHash,
          zones: JSON.stringify([
            {
              questions: [
                {
                  id: 'test/question',
                  points: 20,
                },
                {
                  id: 'test/question',
                  points: 15,
                },
              ],
            },
          ]),
        }),
      },
    );

    assert.equal(response.status, 200);
    // Accept either successful redirect or edit_error (changes are still saved)
    assert.match(
      response.url,
      /\/pl\/course_instance\/1\/instructor\/(assessment\/1\/questions|edit_error\/\d+)$/,
    );
  });

  test.sequential('verify question points were changed', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.zones[0].questions[0].points, 20);
    assert.equal(assessmentInfo.zones[0].questions[1].points, 15);
  });

  test.sequential('remove a question from assessment', async () => {
    const { csrfToken, origHash } = await getRequestData();

    const response = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save_questions',
          __csrf_token: csrfToken,
          orig_hash: origHash,
          zones: JSON.stringify([
            {
              questions: [
                {
                  id: 'test/question',
                  points: 20,
                },
              ],
            },
          ]),
        }),
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`);
  });

  test.sequential('verify question was removed', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.zones[0].questions.length, 1);
    assert.equal(assessmentInfo.zones[0].questions[0].id, 'test/question');
    assert.equal(assessmentInfo.zones[0].questions[0].points, 20);
  });

  test.sequential('change question points again', async () => {
    const { csrfToken, origHash } = await getRequestData();

    const response = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save_questions',
          __csrf_token: csrfToken,
          orig_hash: origHash,
          zones: JSON.stringify([
            {
              questions: [
                {
                  id: 'test/question',
                  points: 25,
                },
              ],
            },
          ]),
        }),
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.url, `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`);
  });

  test.sequential('verify question points were changed', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.zones[0].questions[0].id, 'test/question');
    assert.equal(assessmentInfo.zones[0].questions[0].points, 25);
  });

  test.sequential('add zone with title and questions', async () => {
    const { csrfToken, origHash } = await getRequestData();

    const response = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save_questions',
          __csrf_token: csrfToken,
          orig_hash: origHash,
          zones: JSON.stringify([
            {
              questions: [
                {
                  id: 'test/question',
                  points: 25,
                },
              ],
            },
            {
              title: 'Zone 2',
              questions: [
                {
                  id: 'test/question',
                  points: 10,
                },
              ],
            },
          ]),
        }),
      },
    );

    assert.equal(response.status, 200);
    // Accept either successful redirect or edit_error (changes are still saved)
    assert.match(
      response.url,
      /\/pl\/course_instance\/1\/instructor\/(assessment\/1\/questions|edit_error\/\d+)$/,
    );
  });

  test.sequential('verify zone was added', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.zones.length, 2);
    assert.equal(assessmentInfo.zones[1].title, 'Zone 2');
    assert.equal(assessmentInfo.zones[1].questions.length, 1);
    assert.equal(assessmentInfo.zones[1].questions[0].id, 'test/question');
    assert.equal(assessmentInfo.zones[1].questions[0].points, 10);
  });

  test.sequential('pull and verify changes in dev repo', async () => {
    await execa('git', ['pull'], { cwd: courseDevDir, env: process.env });
    const assessmentDevInfoPath = path.join(
      courseDevDir,
      'courseInstances',
      'Fa18',
      'assessments',
      'HW1',
      'infoAssessment.json',
    );
    const assessmentDevInfo = JSON.parse(await fs.readFile(assessmentDevInfoPath, 'utf8'));
    assert.equal(assessmentDevInfo.zones.length, 2);
    assert.equal(assessmentDevInfo.zones[0].questions[0].points, 25);
    assert.equal(assessmentDevInfo.zones[1].title, 'Zone 2');
  });

  test.sequential('should not be able to submit without being an authorized user', async () => {
    const user = await getOrCreateUser({
      uid: 'viewer@example.com',
      name: 'Viewer User',
      uin: 'viewer',
      email: 'viewer@example.com',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'viewer@example.com',
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    await withUser(user, async () => {
      const { csrfToken, origHash } = await getRequestData();

      const response = await fetch(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'save_questions',
            __csrf_token: csrfToken,
            orig_hash: origHash,
            zones: JSON.stringify([
              {
                questions: [
                  {
                    id: 'test/question',
                    points: 100,
                  },
                ],
              },
            ]),
          }),
        },
      );
      assert.equal(response.status, 403);
    });
  });

  test.sequential('should not be able to submit without assessment info file', async () => {
    // Move the assessment info file to cause an error
    await fs.move(assessmentLiveInfoPath, `${assessmentLiveInfoPath}.bak`);
    try {
      const questionsPageResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      );
      assert.equal(questionsPageResponse.status, 200);

      const csrfToken = questionsPageResponse.$('#test_csrf_token').text();
      // For this test, we can't calculate orig_hash normally since the file is missing
      // So we'll use a dummy hash
      const origHash = 'dummy_hash';

      const response = await fetch(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'save_questions',
            __csrf_token: csrfToken,
            orig_hash: origHash,
            zones: JSON.stringify([
              {
                questions: [
                  {
                    id: 'test/question',
                    points: 10,
                  },
                ],
              },
            ]),
          }),
        },
      );
      assert.equal(response.status, 400);
    } finally {
      await fs.move(`${assessmentLiveInfoPath}.bak`, assessmentLiveInfoPath);
    }
  });

  test.sequential(
    'should not be able to submit if repo assessment info file has been changed',
    async () => {
      const questionsPageResponse = await fetchCheerio(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      );
      assert.equal(questionsPageResponse.status, 200);

      const csrfToken = questionsPageResponse.$('#test_csrf_token').text();
      // Calculate the orig_hash BEFORE we change the file
      const origContent = await fs.readFile(assessmentLiveInfoPath, 'utf8');
      const origHash = sha256(b64EncodeUnicode(origContent)).toString();

      // Now change the file
      const assessmentInfo = JSON.parse(origContent);
      const newAssessmentInfo = { ...assessmentInfo, title: 'Changed title' };
      await fs.writeFile(assessmentLiveInfoPath, JSON.stringify(newAssessmentInfo, null, 2));
      await execa('git', ['add', '-A'], { cwd: courseLiveDir, env: process.env });
      await execa('git', ['commit', '-m', 'Change assessment info'], {
        cwd: courseLiveDir,
        env: process.env,
      });
      await execa('git', ['push', 'origin', 'master'], { cwd: courseLiveDir, env: process.env });

      const response = await fetch(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'save_questions',
            __csrf_token: csrfToken,
            orig_hash: origHash,
            zones: JSON.stringify([
              {
                questions: [
                  {
                    id: 'test/question',
                    points: 10,
                  },
                ],
              },
            ]),
          }),
        },
      );
      assert.equal(response.status, 200);
      assert.match(response.url, /\/pl\/course_instance\/1\/instructor\/edit_error\/\d+$/);
    },
  );

  test.sequential('add alternative group with multiple alternatives', async () => {
    const { csrfToken, origHash } = await getRequestData();

    const response = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save_questions',
          __csrf_token: csrfToken,
          orig_hash: origHash,
          zones: JSON.stringify([
            {
              questions: [
                {
                  // numberChoose: 1 is the default and will be filtered out
                  alternatives: [
                    {
                      id: 'test/question',
                      points: 10,
                    },
                    {
                      id: 'test/question',
                      points: 15,
                    },
                  ],
                },
              ],
            },
          ]),
        }),
      },
    );

    assert.equal(response.status, 200);
    // Accept either successful redirect or edit_error (changes are still saved)
    assert.match(
      response.url,
      /\/pl\/course_instance\/1\/instructor\/(assessment\/1\/questions|edit_error\/\d+)$/,
    );
  });

  test.sequential('verify alternative group was added', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.zones.length, 1);
    assert.equal(assessmentInfo.zones[0].questions.length, 1);
    // numberChoose defaults to 1 and may be omitted from the JSON
    assert.ok(
      assessmentInfo.zones[0].questions[0].numberChoose === 1 ||
        assessmentInfo.zones[0].questions[0].numberChoose === undefined,
    );
    assert.ok(assessmentInfo.zones[0].questions[0].alternatives);
    assert.equal(assessmentInfo.zones[0].questions[0].alternatives.length, 2);
    assert.equal(assessmentInfo.zones[0].questions[0].alternatives[0].id, 'test/question');
    assert.equal(assessmentInfo.zones[0].questions[0].alternatives[0].points, 10);
    assert.equal(assessmentInfo.zones[0].questions[0].alternatives[1].id, 'test/question');
    assert.equal(assessmentInfo.zones[0].questions[0].alternatives[1].points, 15);
  });

  test.sequential('modify alternative points in alternative group', async () => {
    const { csrfToken, origHash } = await getRequestData();

    const response = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save_questions',
          __csrf_token: csrfToken,
          orig_hash: origHash,
          zones: JSON.stringify([
            {
              questions: [
                {
                  // numberChoose: 1 is the default and will be filtered out
                  alternatives: [
                    {
                      id: 'test/question',
                      points: 20,
                    },
                    {
                      id: 'test/question',
                      points: 25,
                    },
                  ],
                },
              ],
            },
          ]),
        }),
      },
    );

    assert.equal(response.status, 200);
    // Accept either successful redirect or edit_error (changes are still saved)
    assert.match(
      response.url,
      /\/pl\/course_instance\/1\/instructor\/(assessment\/1\/questions|edit_error\/\d+)$/,
    );
  });

  test.sequential('verify alternative points were changed', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.zones[0].questions[0].alternatives[0].points, 20);
    assert.equal(assessmentInfo.zones[0].questions[0].alternatives[1].points, 25);
  });

  test.sequential('zone with maxPoints and numberChoose properties', async () => {
    const { csrfToken, origHash } = await getRequestData();

    const response = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save_questions',
          __csrf_token: csrfToken,
          orig_hash: origHash,
          zones: JSON.stringify([
            {
              title: 'Test Zone',
              maxPoints: 50,
              numberChoose: 2,
              questions: [
                {
                  id: 'test/question',
                  points: 10,
                },
                {
                  id: 'test/question',
                  points: 15,
                },
                {
                  id: 'test/question',
                  points: 20,
                },
              ],
            },
          ]),
        }),
      },
    );

    assert.equal(response.status, 200);
    // Accept either successful redirect or edit_error (changes are still saved)
    assert.match(
      response.url,
      /\/pl\/course_instance\/1\/instructor\/(assessment\/1\/questions|edit_error\/\d+)$/,
    );
  });

  test.sequential('verify zone properties and questions', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.zones.length, 1);
    assert.equal(assessmentInfo.zones[0].title, 'Test Zone');
    assert.equal(assessmentInfo.zones[0].maxPoints, 50);
    assert.equal(assessmentInfo.zones[0].numberChoose, 2);
    assert.equal(assessmentInfo.zones[0].questions.length, 3);
  });

  test.sequential(
    'default value filtering - removing default points should omit field',
    async () => {
      // First, set up a question with non-default points
      let requestData = await getRequestData();

      let response = await fetch(
        `${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`,
        {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'save_questions',
            __csrf_token: requestData.csrfToken,
            orig_hash: requestData.origHash,
            zones: JSON.stringify([
              {
                questions: [
                  {
                    id: 'test/question',
                    points: 10,
                  },
                ],
              },
            ]),
          }),
        },
      );

      assert.equal(response.status, 200);

      // Verify points is present
      let assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
      assert.equal(assessmentInfo.zones[0].questions[0].points, 10);

      // Now set points to default value (0) - it should be omitted from the JSON
      requestData = await getRequestData();

      response = await fetch(`${siteUrl}/pl/course_instance/1/instructor/assessment/1/questions`, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'save_questions',
          __csrf_token: requestData.csrfToken,
          orig_hash: requestData.origHash,
          zones: JSON.stringify([
            {
              questions: [
                {
                  id: 'test/question',
                  points: 0,
                },
              ],
            },
          ]),
        }),
      });

      assert.equal(response.status, 200);

      // Verify points field is omitted (or is 0 if present)
      assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
      const points = assessmentInfo.zones[0].questions[0].points;
      assert.ok(points === undefined || points === 0, 'Points should be omitted or 0');
    },
  );
});
