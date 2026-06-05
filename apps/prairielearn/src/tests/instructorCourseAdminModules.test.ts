import * as path from 'path';

import fs from 'fs-extra';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getAppError } from '../lib/client/errors.js';
import { config } from '../lib/config.js';
import { computeScopedJsonHash } from '../lib/editorUtil.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectAssessmentModulesForCourse } from '../models/assessment-module.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import type { CourseJsonInput } from '../schemas/infoCourse.js';
import type { AssessmentModulesError } from '../trpc/course/assessment-modules.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const modulesUrl = `${siteUrl}/pl/course/1/course_admin/modules`;

function createTrpcClient() {
  const csrfToken = generatePrefixCsrfToken(
    { url: '/pl/course/1/trpc', authn_user_id: '1' },
    config.secretKey,
  );
  return createCourseTrpcClient({ csrfToken, courseId: '1', urlBase: siteUrl });
}

describe('Instructor course admin modules page', () => {
  let courseRepo: CourseRepoFixture;

  function infoCoursePath() {
    return path.join(courseRepo.courseLiveDir, 'infoCourse.json');
  }

  function currentOrigHash() {
    return computeScopedJsonHash<CourseJsonInput>(
      infoCoursePath(),
      (json) => json.assessmentModules ?? [],
    );
  }

  async function currentModulesInput() {
    const modules = await selectAssessmentModulesForCourse('1');
    return modules.map((module) => ({
      name: module.name,
      heading: module.heading,
      implicit: module.implicit,
    }));
  }

  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(TEST_COURSE_PATH);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });

    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Test Instructor',
      uin: '100000000',
      email: 'instructor@example.com',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: instructor.uid,
      course_role: 'Owner',
      authn_user_id: instructor.id,
    });
  });

  afterAll(helperServer.after);

  test.sequential('loads the page and the list endpoint', async () => {
    const pageResponse = await fetch(modulesUrl);
    assert.equal(pageResponse.status, 200);

    const client = createTrpcClient();
    const result = await client.assessmentModules.list.query();
    assert.isArray(result.modules);
    assert.isNotNull(result.origHash);
    assert.includeMembers(
      result.modules.map((m) => m.name),
      ['Module1', 'Module5'],
    );
  });

  test.sequential('creates a new module', async () => {
    const client = createTrpcClient();
    const origHash = await currentOrigHash();

    await client.assessmentModules.save.mutate({
      modules: [
        ...(await currentModulesInput()),
        { name: 'Quizzes', heading: 'Quizzes', implicit: false },
      ],
      origHash,
    });

    const modules = await selectAssessmentModulesForCourse('1');
    const created = modules.find((m) => m.name === 'Quizzes');
    assert.isDefined(created);
    assert.equal(created.heading, 'Quizzes');
    assert.isFalse(created.implicit);

    const fileJson = (await fs.readJson(infoCoursePath())) as CourseJsonInput;
    assert.isDefined(fileJson.assessmentModules?.find((m) => m.name === 'Quizzes'));
  });

  test.sequential('renames a module heading', async () => {
    const client = createTrpcClient();
    const origHash = await currentOrigHash();

    const modules = (await currentModulesInput()).map((module) =>
      module.name === 'Module1' ? { ...module, heading: 'Renamed module 1' } : module,
    );
    await client.assessmentModules.save.mutate({ modules, origHash });

    const updated = (await selectAssessmentModulesForCourse('1')).find((m) => m.name === 'Module1');
    assert.isDefined(updated);
    assert.equal(updated.heading, 'Renamed module 1');
  });

  test.sequential('deletes a module', async () => {
    const client = createTrpcClient();
    const origHash = await currentOrigHash();

    const modules = (await currentModulesInput()).filter((module) => module.name !== 'Quizzes');
    await client.assessmentModules.save.mutate({ modules, origHash });

    const remaining = (await selectAssessmentModulesForCourse('1')).map((m) => m.name);
    assert.notInclude(remaining, 'Quizzes');
  });

  test.sequential('rejects a stale hash with a conflict error', async () => {
    const client = createTrpcClient();

    try {
      await client.assessmentModules.save.mutate({
        modules: await currentModulesInput(),
        origHash: 'stale-hash-that-does-not-match',
      });
      assert.fail('Expected a conflict error');
    } catch (err) {
      const appError = getAppError<AssessmentModulesError['Save']>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'modified since');
    }
  });

  test.sequential('rejects duplicate module names', async () => {
    const client = createTrpcClient();
    const origHash = await currentOrigHash();

    try {
      await client.assessmentModules.save.mutate({
        modules: [
          { name: 'Duplicate', heading: 'First', implicit: false },
          { name: 'Duplicate', heading: 'Second', implicit: false },
        ],
        origHash,
      });
      assert.fail('Expected a duplicate-name error');
    } catch (err) {
      const appError = getAppError<AssessmentModulesError['Save']>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'unique');
    }
  });
});
