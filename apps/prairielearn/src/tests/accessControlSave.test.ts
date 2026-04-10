import * as path from 'node:path';

import { merge } from 'es-toolkit';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { computeScopedJsonHash } from '../lib/editorUtil.js';
import { features } from '../lib/features/index.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import type { AccessControlJsonInput } from '../schemas/accessControl.js';
import type { AssessmentJsonInput } from '../schemas/infoAssessment.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getConfiguredUser } from './utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;

function makeRule(overrides: Partial<AccessControlJsonInput> = {}): AccessControlJsonInput {
  return merge(
    {
      dateControl: {
        releaseDate: '2024-03-14T00:01:00',
        dueDate: '2024-03-21T23:59:00',
      },
    },
    overrides,
  ) as AccessControlJsonInput;
}

describe('Access control save via tRPC', () => {
  let courseRepo: CourseRepoFixture;
  let assessmentId: string;

  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(TEST_COURSE_PATH);
    await helperServer.before(courseRepo.courseLiveDir)();
    await features.enable('enhanced-access-control');
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });

    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw19-accessControlUi',
    });
    assessmentId = assessment.id;
  });

  afterAll(helperServer.after);

  async function createClient() {
    const user = await getConfiguredUser();
    const trpcPath = getAssessmentTrpcUrl({
      courseInstanceId: '1',
      assessmentId,
    });
    const csrfToken = generatePrefixCsrfToken(
      {
        url: trpcPath,
        authn_user_id: user.id,
      },
      config.secretKey,
    );
    return createAssessmentTrpcClient({
      csrfToken,
      courseInstanceId: '1',
      assessmentId,
      urlBase: siteUrl,
    });
  }

  async function getOrigHash() {
    const hash = await computeScopedJsonHash<AssessmentJsonInput>(
      assessmentPath(),
      (json) => json.accessControl ?? [],
    );
    return hash;
  }

  function assessmentPath() {
    return path.join(
      courseRepo.courseLiveDir,
      'courseInstances',
      'Sp15',
      'assessments',
      'hw19-accessControlUi',
      'infoAssessment.json',
    );
  }

  test.sequential('saves rules to disk and syncs to DB', async () => {
    const client = await createClient();
    const origHash = await getOrigHash();

    const rules: AccessControlJsonInput[] = [
      makeRule({ listBeforeRelease: true }),
      makeRule({
        labels: ['Section A'],
        dateControl: { dueDate: '2024-04-01T23:59:00' },
      }),
    ];

    const result = await client.accessControl.saveAllRules.mutate({ rules, origHash });
    assert.isString(result.newHash);
    assert.notEqual(result.newHash, origHash);

    // Verify the file on disk was updated
    const fileContent = await fs.readFile(assessmentPath(), 'utf8');
    const parsed = JSON.parse(fileContent);

    assert.isArray(parsed.accessControl);
    assert.equal(parsed.accessControl.length, 2);
    assert.equal(parsed.accessControl[0].listBeforeRelease, true);
    assert.deepEqual(parsed.accessControl[1].labels, ['Section A']);
    assert.equal(parsed.accessControl[1].dateControl.dueDate, '2024-04-01T23:59:00');

    // Verify other keys are preserved
    assert.equal(parsed.uuid, 'f5b2c8d1-9a3e-4f7b-8c1d-2e5a6b9c0d1f');
    assert.equal(parsed.type, 'Homework');
    assert.isArray(parsed.zones);
  });

  test.sequential('omits listBeforeRelease: false and empty objects from disk', async () => {
    const client = await createClient();
    const origHash = await getOrigHash();

    const rules: AccessControlJsonInput[] = [{ listBeforeRelease: false }];

    const result = await client.accessControl.saveAllRules.mutate({ rules, origHash });
    assert.isString(result.newHash);

    const fileContent = await fs.readFile(assessmentPath(), 'utf8');
    const parsed = JSON.parse(fileContent);

    assert.equal(parsed.accessControl.length, 1);
    assert.notProperty(parsed.accessControl[0], 'listBeforeRelease');
  });

  test.sequential('rejects save with stale origHash', async () => {
    const client = await createClient();
    const staleHash = await getOrigHash();

    // First save succeeds and changes the hash.
    await client.accessControl.saveAllRules.mutate({
      rules: [makeRule()],
      origHash: staleHash,
    });

    // Second save with the same (now stale) hash must fail.
    await expect(
      client.accessControl.saveAllRules.mutate({
        rules: [makeRule({ dateControl: { dueDate: '2024-05-01T23:59:00' } })],
        origHash: staleHash,
      }),
    ).rejects.toThrow(/modified since you loaded/);
  });
});
