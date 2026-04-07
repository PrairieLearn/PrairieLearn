import * as path from 'path';

import { TRPCClientError } from '@trpc/client';
import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getAppError } from '../lib/client/errors.js';
import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { AssessmentSchema } from '../lib/db-types.js';
import { getOriginalHash } from '../lib/editors.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import {
  type AssessmentSettingsError,
  type assessmentSettingsRouter,
} from '../trpc/assessment/assessment-settings.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { getConfiguredUser, getOrCreateUser, withUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');
const siteUrl = `http://localhost:${config.serverPort}`;

let courseRepo: CourseRepoFixture;
let assessmentLiveInfoPath: string;
let assessmentDevInfoPath: string;

function assessmentLiveDir() {
  return path.join(courseRepo.courseLiveDir, 'courseInstances', 'Fa18', 'assessments');
}

function assessmentDevDir() {
  return path.join(courseRepo.courseDevDir, 'courseInstances', 'Fa18', 'assessments');
}

async function getOrigHash(infoPath: string) {
  return (await getOriginalHash(infoPath)) ?? '';
}

async function createTrpcClient(assessmentId: string) {
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

describe('Editing assessment settings', () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(courseTemplateDir);
    assessmentLiveInfoPath = path.join(assessmentLiveDir(), 'HW1', 'infoAssessment.json');
    assessmentDevInfoPath = path.join(assessmentDevDir(), 'HW1', 'infoAssessment.json');
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
  });

  afterAll(helperServer.after);

  test.sequential('access the test assessment info file', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentInfo.title, 'Homework for file editor test');
  });

  test.sequential('change assessment info', async () => {
    const trpcClient = await createTrpcClient('1');
    const result = await trpcClient.assessmentSettings.updateAssessment.mutate({
      title: 'Test Title',
      set: 'Practice Quiz',
      number: '1',
      module: 'Module2',
      aid: 'HW2',
      text: '',
      allow_issue_reporting: true,
      allow_personal_notes: true,
      multiple_instance: false,
      auto_close: true,
      require_honor_code: true,
      honor_code: '',
      origHash: await getOrigHash(assessmentLiveInfoPath),
    });
    assert.ok(result.origHash);
  });

  test.sequential('verify assessment info change', async () => {
    assessmentLiveInfoPath = path.join(assessmentLiveDir(), 'HW2', 'infoAssessment.json');
    const assessmentLiveInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    assert.equal(assessmentLiveInfo.title, 'Test Title');
    assert.equal(assessmentLiveInfo.type, 'Homework');
    assert.equal(assessmentLiveInfo.set, 'Practice Quiz');
    assert.equal(assessmentLiveInfo.number, '1');
    assert.equal(assessmentLiveInfo.module, 'Module2');
  });

  test.sequential('verify nesting an assessment id', async () => {
    const trpcClient = await createTrpcClient('1');
    const result = await trpcClient.assessmentSettings.updateAssessment.mutate({
      title: 'Test Title',
      set: 'Practice Quiz',
      number: '1',
      module: 'Module2',
      aid: 'nestedPath/HW2',
      text: '',
      allow_issue_reporting: true,
      allow_personal_notes: true,
      multiple_instance: false,
      auto_close: true,
      require_honor_code: true,
      honor_code: '',
      origHash: await getOrigHash(assessmentLiveInfoPath),
    });
    assert.ok(result.origHash);
  });

  test.sequential('verify changing aid did not leave empty directories', async () => {
    const assessmentDir = path.join(assessmentLiveDir(), 'HW2');
    assert.notOk(await fs.pathExists(assessmentDir));
    assessmentLiveInfoPath = path.join(
      assessmentLiveDir(),
      'nestedPath',
      'HW2',
      'infoAssessment.json',
    );
  });

  test.sequential('verify reverting a nested assessment id works correctly', async () => {
    const trpcClient = await createTrpcClient('1');
    const result = await trpcClient.assessmentSettings.updateAssessment.mutate({
      title: 'Test Title',
      set: 'Practice Quiz',
      number: '1',
      module: 'Module2',
      aid: 'HW2',
      text: '',
      allow_issue_reporting: true,
      allow_personal_notes: true,
      multiple_instance: false,
      auto_close: true,
      require_honor_code: true,
      honor_code: '',
      origHash: await getOrigHash(assessmentLiveInfoPath),
    });
    assert.ok(result.origHash);
    assessmentLiveInfoPath = path.join(assessmentLiveDir(), 'HW2', 'infoAssessment.json');
  });

  test.sequential('pull and verify changes', async () => {
    await execa('git', ['pull'], { cwd: courseRepo.courseDevDir, env: process.env });
    assessmentDevInfoPath = path.join(assessmentDevDir(), 'HW2', 'infoAssessment.json');
    const assessmentDevInfo = JSON.parse(await fs.readFile(assessmentDevInfoPath, 'utf8'));
    assert.equal(assessmentDevInfo.title, 'Test Title');
    assert.equal(assessmentDevInfo.type, 'Homework');
    assert.equal(assessmentDevInfo.set, 'Practice Quiz');
    assert.equal(assessmentDevInfo.number, '1');
    assert.equal(assessmentDevInfo.module, 'Module2');
  });

  test.sequential('verify assessment info change in db', async () => {
    const assessment = await queryRow(
      sql.select_assessment_by_id,
      { id: 1 },
      AssessmentSchema.extend({
        assessment_set_name: z.string(),
        assessment_module_name: z.string(),
      }),
    );
    assert.equal(assessment.title, 'Test Title');
    assert.equal(assessment.type, 'Homework');
    assert.equal(assessment.assessment_set_name, 'Practice Quiz');
    assert.equal(assessment.number, '1');
    assert.equal(assessment.assessment_module_name, 'Module2');
    assert.equal(assessment.tid, 'HW2');
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
      // Viewer user creates their own tRPC client
      const trpcPath = getAssessmentTrpcUrl({
        courseInstanceId: '1',
        assessmentId: '1',
      });
      const csrfToken = generatePrefixCsrfToken(
        {
          url: trpcPath,
          authn_user_id: user.id,
        },
        config.secretKey,
      );
      const trpcClient = createAssessmentTrpcClient({
        csrfToken,
        courseInstanceId: '1',
        assessmentId: '1',
        urlBase: siteUrl,
      });

      try {
        await trpcClient.assessmentSettings.updateAssessment.mutate({
          title: 'Test Title - Unauthorized',
          set: 'Homework',
          number: '1',
          module: 'Module1',
          aid: 'HW1',
          text: '',
          allow_issue_reporting: true,
          allow_personal_notes: true,
          multiple_instance: false,
          auto_close: true,
          require_honor_code: true,
          honor_code: '',
          origHash: await getOrigHash(assessmentLiveInfoPath),
        });
        assert.fail('Expected mutation to throw');
      } catch (err: unknown) {
        assert.instanceOf(err, TRPCClientError);
        assert.equal(
          (err as TRPCClientError<typeof assessmentSettingsRouter>).data?.code,
          'FORBIDDEN',
        );
      }
    });
  });

  test.sequential('should not be able to submit without assessment info file', async () => {
    const origHash = await getOrigHash(assessmentLiveInfoPath);
    await fs.move(assessmentLiveInfoPath, `${assessmentLiveInfoPath}.bak`);
    try {
      const trpcClient = await createTrpcClient('1');
      try {
        await trpcClient.assessmentSettings.updateAssessment.mutate({
          title: 'Test Title - No Course Info',
          set: 'Homework',
          number: '1',
          module: 'Module1',
          aid: 'HW1',
          text: '',
          allow_issue_reporting: true,
          allow_personal_notes: true,
          multiple_instance: false,
          auto_close: true,
          require_honor_code: true,
          honor_code: '',
          origHash,
        });
        assert.fail('Expected mutation to throw');
      } catch (err: unknown) {
        assert.instanceOf(err, TRPCClientError);
        assert.equal(
          (err as TRPCClientError<typeof assessmentSettingsRouter>).data?.code,
          'BAD_REQUEST',
        );
      }
    } finally {
      await fs.move(`${assessmentLiveInfoPath}.bak`, assessmentLiveInfoPath);
    }
  });

  test.sequential('should be able to submit without any changes', async () => {
    const assessmentInfo = JSON.parse(await fs.readFile(assessmentLiveInfoPath, 'utf8'));
    const trpcClient = await createTrpcClient('1');
    const result = await trpcClient.assessmentSettings.updateAssessment.mutate({
      title: assessmentInfo.title,
      set: assessmentInfo.set,
      number: assessmentInfo.number,
      module: assessmentInfo.module,
      aid: 'HW2',
      text: '',
      allow_issue_reporting: true,
      allow_personal_notes: true,
      multiple_instance: false,
      auto_close: true,
      require_honor_code: true,
      honor_code: '',
      origHash: await getOrigHash(assessmentLiveInfoPath),
    });
    assert.ok(result.origHash);
  });

  test.sequential(
    'should not be able to submit if repo course info file has been changed',
    async () => {
      const staleOrigHash = await getOrigHash(assessmentLiveInfoPath);

      const assessmentInfo = JSON.parse(await fs.readFile(assessmentDevInfoPath, 'utf8'));
      const newAssessmentInfo = { ...assessmentInfo, title: 'Test Title - Changed' };
      await fs.writeFile(assessmentDevInfoPath, JSON.stringify(newAssessmentInfo, null, 2));
      await execa('git', ['add', '-A'], { cwd: courseRepo.courseDevDir, env: process.env });
      await execa('git', ['commit', '-m', 'Change assessment info'], {
        cwd: courseRepo.courseDevDir,
        env: process.env,
      });
      await execa('git', ['push', 'origin', 'master'], {
        cwd: courseRepo.courseDevDir,
        env: process.env,
      });

      const trpcClient = await createTrpcClient('1');
      try {
        await trpcClient.assessmentSettings.updateAssessment.mutate({
          title: 'Test Title2',
          set: 'Homework',
          number: '1',
          module: 'Module1',
          aid: 'HW1',
          text: '',
          allow_issue_reporting: true,
          allow_personal_notes: true,
          multiple_instance: false,
          auto_close: true,
          require_honor_code: true,
          honor_code: '',
          origHash: staleOrigHash,
        });
        assert.fail('Expected mutation to throw');
      } catch (err: unknown) {
        const appError = getAppError<AssessmentSettingsError['UpdateAssessment']>(err);
        assert.isNotNull(appError);
        assert.equal(appError.code, 'SYNC_JOB_FAILED');
      }
    },
  );

  test.sequential('change assessment id', async () => {
    const trpcClient = await createTrpcClient('1');
    const result = await trpcClient.assessmentSettings.updateAssessment.mutate({
      title: 'Test Title',
      set: 'Homework',
      number: '1',
      module: 'Module1',
      aid: 'A1',
      text: '',
      allow_issue_reporting: true,
      allow_personal_notes: true,
      multiple_instance: false,
      auto_close: true,
      require_honor_code: true,
      honor_code: '',
      origHash: await getOrigHash(assessmentLiveInfoPath),
    });
    assert.ok(result.origHash);
  });

  test.sequential('verify change assessment id', async () => {
    const assessmentDir = path.join(assessmentLiveDir(), 'A1');
    assert.ok(await fs.pathExists(assessmentDir));
    assessmentLiveInfoPath = path.join(assessmentDir, 'infoAssessment.json');
  });

  test.sequential(
    'should not be able to submit if provided assessment id falls outside the correct root directory',
    async () => {
      const trpcClient = await createTrpcClient('1');
      try {
        await trpcClient.assessmentSettings.updateAssessment.mutate({
          title: 'Test Title',
          set: 'Homework',
          number: '1',
          module: 'Module1',
          aid: '../A2',
          text: '',
          allow_issue_reporting: true,
          allow_personal_notes: true,
          multiple_instance: false,
          auto_close: true,
          require_honor_code: true,
          honor_code: '',
          origHash: await getOrigHash(assessmentLiveInfoPath),
        });
        assert.fail('Expected mutation to throw');
      } catch (err: unknown) {
        const appError = getAppError<AssessmentSettingsError['UpdateAssessment']>(err);
        assert.isNotNull(appError);
        assert.equal(appError.code, 'INVALID_SHORT_NAME');
      }
    },
  );
});
