import * as path from 'path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getAppError } from '../lib/client/errors.js';
import { getCourseTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { computeStableHash } from '../lib/json.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { selectUserByUid } from '../models/user.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';
import type { SharedStateError } from '../trpc/course/shared-state.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');
const siteUrl = `http://localhost:${config.serverPort}`;

let courseRepo: CourseRepoFixture;

async function infoCoursePath() {
  return path.join(courseRepo.courseLiveDir, 'infoCourse.json');
}

async function sharedStateOrigHash() {
  const courseInfo = JSON.parse(await fs.readFile(await infoCoursePath(), 'utf8'));
  return computeStableHash(courseInfo.sharedState ?? {});
}

async function trpcClient() {
  const devUser = await selectUserByUid('dev@example.com');
  const csrfToken = generatePrefixCsrfToken(
    { url: getCourseTrpcUrl('1'), authn_user_id: devUser.id },
    config.secretKey,
  );
  return createCourseTrpcClient({ csrfToken, courseId: '1', urlBase: siteUrl });
}

describe('Editing shared-data settings', { concurrent: false }, () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(courseTemplateDir);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
  });

  afterAll(helperServer.after);

  test('saveSharedState creates an object and writes it to infoCourse.json', async () => {
    const client = await trpcClient();
    const result = await client.sharedState.saveSharedState.mutate({
      origHash: await sharedStateOrigHash(),
      objects: [
        {
          name: 'testObject',
          dataVersion: 1,
          properties: [{ name: 'value', type: 'string', default: 'a', enum: [] }],
        },
      ],
    });
    assert.ok(result.origHash);

    const courseInfo = JSON.parse(await fs.readFile(await infoCoursePath(), 'utf8'));
    assert.deepEqual(courseInfo.sharedState.testObject, {
      scope: 'assessmentInstance',
      dataVersion: 1,
      properties: { value: { type: 'string', default: 'a' } },
    });
  });

  test('saveSharedState rejects duplicate names with DUPLICATE_NAME', async () => {
    const client = await trpcClient();
    try {
      await client.sharedState.saveSharedState.mutate({
        origHash: await sharedStateOrigHash(),
        objects: [
          {
            name: 'dup',
            dataVersion: 1,
            properties: [{ name: 'value', type: 'string', default: 'a', enum: [] }],
          },
          {
            name: 'dup',
            dataVersion: 1,
            properties: [{ name: 'value', type: 'string', default: 'a', enum: [] }],
          },
        ],
      });
      assert.fail('Expected mutation to throw');
    } catch (err: unknown) {
      const appError = getAppError<SharedStateError['SaveSharedState']>(err);
      assert.isNotNull(appError);
      assert.equal(appError.code, 'DUPLICATE_NAME');
    }
  });

  test('saveSharedState rejects a default that does not match its declared type', async () => {
    const client = await trpcClient();
    try {
      await client.sharedState.saveSharedState.mutate({
        origHash: await sharedStateOrigHash(),
        objects: [
          {
            name: 'testObject',
            dataVersion: 1,
            properties: [{ name: 'value', type: 'number', default: 'not-a-number', enum: [] }],
          },
        ],
      });
      assert.fail('Expected mutation to throw');
    } catch (err: unknown) {
      const appError = getAppError<SharedStateError['SaveSharedState']>(err);
      assert.isNotNull(appError);
      assert.equal(appError.code, 'INVALID_PROPERTIES');
    }
  });

  test('saveSharedState rejects a stale origHash with CONFLICT', async () => {
    const client = await trpcClient();
    try {
      await client.sharedState.saveSharedState.mutate({
        origHash: 'not-the-current-hash',
        objects: [],
      });
      assert.fail('Expected mutation to throw');
    } catch (err: unknown) {
      const appError = getAppError<SharedStateError['SaveSharedState']>(err);
      assert.isNotNull(appError);
      assert.equal(appError.code, 'CONFLICT');
    }
  });

  test('saveSharedState is denied for a course viewer', async () => {
    const user = await getOrCreateUser({
      uid: 'shared-state-viewer@example.com',
      name: 'Viewer User',
      uin: 'shared-state-viewer',
      email: 'shared-state-viewer@example.com',
    });
    const devUser = await selectUserByUid('dev@example.com');
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'shared-state-viewer@example.com',
      course_role: 'Viewer',
      authn_user_id: devUser.id,
    });
    await withUser(user, async () => {
      const csrfToken = generatePrefixCsrfToken(
        { url: getCourseTrpcUrl('1'), authn_user_id: user.id },
        config.secretKey,
      );
      const client = createCourseTrpcClient({ csrfToken, courseId: '1', urlBase: siteUrl });
      try {
        await client.sharedState.saveSharedState.mutate({
          origHash: await sharedStateOrigHash(),
          objects: [],
        });
        assert.fail('Expected mutation to throw');
      } catch (err: unknown) {
        const appError = getAppError<Record<string, never>>(err);
        assert.isNotNull(appError);
        assert.include(appError.message, 'Access denied (must be a course editor)');
      }
    });
  });
});
