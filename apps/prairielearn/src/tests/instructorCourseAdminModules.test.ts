import * as path from 'path';

import fs from 'fs-extra';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';
import { computeScopedJsonHash } from '../lib/editorUtil.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import {
  selectAssessmentModulesForCourse,
  selectAssessmentModulesWithAssessmentsForCourse,
} from '../models/assessment-module.js';
import type { CourseJsonInput } from '../schemas/infoCourse.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

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

  function assessmentInfoPath(tid: string) {
    return path.join(
      courseRepo.courseLiveDir,
      'courseInstances',
      'Sp15',
      'assessments',
      tid,
      'infoAssessment.json',
    );
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
      id: module.id,
      name: module.name,
      heading: module.heading,
      implicit: module.implicit,
    }));
  }

  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(TEST_COURSE_PATH);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
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

  test.sequential('list includes each module with its assessments', async () => {
    const client = createTrpcClient();
    const result = await client.assessmentModules.list.query();

    const module1 = result.modules.find((m) => m.name === 'Module1');
    assert.isDefined(module1);
    assert.lengthOf(module1.assessments, 3);
    for (const assessment of module1.assessments) {
      assert.isNotEmpty(assessment.label);
      assert.isNotEmpty(assessment.title);
    }

    const module4 = result.modules.find((m) => m.name === 'Module4');
    assert.isDefined(module4);
    assert.lengthOf(module4.assessments, 0);
  });

  test.sequential('creates a new module', async () => {
    const client = createTrpcClient();
    const origHash = await currentOrigHash();

    await client.assessmentModules.save.mutate({
      modules: [
        ...(await currentModulesInput()),
        { id: null, name: 'Quizzes', heading: 'Quizzes', implicit: false },
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

  test.sequential('persists reordered modules', async () => {
    const client = createTrpcClient();
    const origHash = await currentOrigHash();

    const modules = await currentModulesInput();
    const explicitBefore = modules.filter((m) => !m.implicit).map((m) => m.name);

    await client.assessmentModules.save.mutate({ modules: [...modules].reverse(), origHash });

    const after = await selectAssessmentModulesForCourse('1');
    const explicitAfter = after.filter((m) => !m.implicit).map((m) => m.name);
    assert.deepEqual(explicitAfter, [...explicitBefore].reverse());

    const fileJson = (await fs.readJson(infoCoursePath())) as CourseJsonInput;
    assert.deepEqual(
      fileJson.assessmentModules?.map((m) => m.name),
      [...explicitBefore].reverse(),
    );
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

  test.sequential('renaming a module updates referencing assessments', async () => {
    const client = createTrpcClient();
    const origHash = await currentOrigHash();

    const modules = (await currentModulesInput()).map((module) =>
      module.name === 'Module2' ? { ...module, name: 'Module2Renamed' } : module,
    );
    await client.assessmentModules.save.mutate({ modules, origHash });

    const after = await selectAssessmentModulesWithAssessmentsForCourse('1');
    assert.isUndefined(after.find((m) => m.name === 'Module2'));
    const renamed = after.find((m) => m.name === 'Module2Renamed');
    assert.isDefined(renamed);
    assert.lengthOf(renamed.assessments, 3);

    const assessmentJson = await fs.readJson(assessmentInfoPath('hw3-partialCredit'));
    assert.equal(assessmentJson.module, 'Module2Renamed');
  });

  test.sequential('deleting a module reassigns its assessments to Default', async () => {
    const client = createTrpcClient();
    const origHash = await currentOrigHash();

    const defaultBefore = (await selectAssessmentModulesWithAssessmentsForCourse('1')).find(
      (m) => m.name === 'Default',
    );
    assert.isDefined(defaultBefore);

    const modules = (await currentModulesInput()).filter((module) => module.name !== 'Module3');
    await client.assessmentModules.save.mutate({ modules, origHash });

    const after = await selectAssessmentModulesWithAssessmentsForCourse('1');
    assert.isUndefined(after.find((m) => m.name === 'Module3'));

    const defaultAfter = after.find((m) => m.name === 'Default');
    assert.isDefined(defaultAfter);
    assert.equal(defaultAfter.assessments.length, defaultBefore.assessments.length + 1);

    const assessmentJson = await fs.readJson(assessmentInfoPath('hw5-templateGroupWork'));
    assert.isUndefined(assessmentJson.module);
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

    await expect(
      client.assessmentModules.save.mutate({
        modules: await currentModulesInput(),
        origHash: 'stale-hash-that-does-not-match',
      }),
    ).rejects.toThrow(/modified since/);
  });

  test.sequential('rejects duplicate module names', async () => {
    const client = createTrpcClient();
    const origHash = await currentOrigHash();

    await expect(
      client.assessmentModules.save.mutate({
        modules: [
          { id: null, name: 'Duplicate', heading: 'First', implicit: false },
          { id: null, name: 'Duplicate', heading: 'Second', implicit: false },
        ],
        origHash,
      }),
    ).rejects.toThrow(/unique/);
  });
});
