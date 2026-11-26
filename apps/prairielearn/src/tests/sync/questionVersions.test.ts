import * as path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  ChunkSchema,
  QuestionVersionSchema,
  QuestionVersionSettingSchema,
} from '../../lib/db-types.js';
import { selectQuestionByQid } from '../../models/question.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const VersionSchema = z.object({
  question_version: QuestionVersionSchema,
  settings: QuestionVersionSettingSchema.nullable(),
  created_at: z.string(),
  superseded_at: z.string().nullable(),
});

function selectQuestion(courseId: string) {
  return selectQuestionByQid({ course_id: courseId, qid: util.QUESTION_ID });
}

async function selectVersions(questionId: string) {
  return await sqldb.queryRows(sql.select_versions, { question_id: questionId }, VersionSchema);
}

describe('Question version sync without chunks', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);
  beforeEach(helperDb.resetDatabase);

  it('creates settings outside Git, preserves no-ops, and snapshots settings changes', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();
    const question = await selectQuestion(syncResults.courseId);
    const initial = await selectVersions(question.id);
    expect(initial).toHaveLength(1);
    expect(initial[0].question_version.commit_hash).toBeNull();
    expect(initial[0].question_version.uses_chunks).toBe(false);
    expect(initial[0].settings).toEqual({
      ...QuestionVersionSettingSchema.omit({ question_version_id: true }).parse(question),
      question_version_id: initial[0].question_version.id,
    });
    expect(await util.dumpTableWithSchema('chunks', ChunkSchema)).toEqual([]);

    await util.syncCourseData(courseDir);
    expect(await selectVersions(question.id)).toEqual(initial);

    await fs.writeJson(path.join(courseDir, 'questions', util.QUESTION_ID, 'info.json'), {
      ...courseData.questions[util.QUESTION_ID],
      title: 'Updated title',
      partialCredit: false,
    });
    await util.syncCourseData(courseDir);
    const changed = await selectVersions(question.id);
    expect(changed).toHaveLength(2);
    expect(changed[0].settings).toEqual(initial[0].settings);
    expect(changed[1].settings).toMatchObject({ title: 'Updated title', partial_credit: false });
    expect(changed[0].superseded_at).toBe(changed[1].created_at);
  });

  it('detects uncommitted code changes at the same Git hash and writes identical settings again', async () => {
    const courseDir = await util.writeCourseToTempDirectory(util.getCourseData());
    await execa('git', ['init'], { cwd: courseDir });
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: courseDir });
    await execa('git', ['config', 'user.name', 'Test User'], { cwd: courseDir });
    await execa('git', ['add', '.'], { cwd: courseDir });
    await execa('git', ['commit', '-m', 'Initial course'], { cwd: courseDir });
    const { stdout: commitHash } = await execa('git', ['rev-parse', 'HEAD'], { cwd: courseDir });
    const syncResults = await util.syncCourseData(courseDir);
    const question = await selectQuestion(syncResults.courseId);
    const initial = await selectVersions(question.id);
    expect(initial[0].question_version.commit_hash).toBe(commitHash);

    await fs.writeFile(
      path.join(courseDir, 'questions', util.QUESTION_ID, 'server.py'),
      '# Local edit\n',
    );
    await util.syncCourseData(courseDir);
    const changed = await selectVersions(question.id);
    expect(changed).toHaveLength(2);
    expect(changed[1].question_version.commit_hash).toBe(commitHash);
    expect(changed[1].settings).toEqual({
      ...initial[0].settings,
      question_version_id: changed[1].question_version.id,
    });
  });

  it('publishes versions for questions synced with duplicate UUID warnings', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();
    const original = await selectQuestion(syncResults.courseId);
    const questionInfo = courseData.questions[util.QUESTION_ID];
    await fs.writeJson(path.join(courseDir, 'questions', util.QUESTION_ID, 'info.json'), {
      ...questionInfo,
      title: 'Updated question',
    });
    await fs.outputJson(path.join(courseDir, 'questions', 'duplicate', 'info.json'), {
      ...questionInfo,
      title: 'New question with duplicate UUID',
    });

    const synced = await util.syncCourseData(courseDir);
    assert(synced.status === 'complete');
    expect(synced.hadJsonErrors).toBe(false);
    expect(synced.courseData.questions[util.QUESTION_ID].warnings).not.toHaveLength(0);

    const updated = await selectQuestion(syncResults.courseId);
    expect(updated).toMatchObject({ id: original.id, uuid: null, title: 'Updated question' });
    const versions = await selectVersions(updated.id);
    expect(versions).toHaveLength(2);
    expect(versions[0].superseded_at).toBe(versions[1].created_at);
    expect(versions[1]).toMatchObject({
      settings: { title: 'Updated question' },
      superseded_at: null,
    });

    const duplicate = await selectQuestionByQid({
      course_id: syncResults.courseId,
      qid: 'duplicate',
    });
    expect(await selectVersions(duplicate.id)).toMatchObject([
      { settings: { title: 'New question with duplicate UUID' }, superseded_at: null },
    ]);
  });

  it('advances versions for course dependencies and template file changes', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].template = util.ALTERNATIVE_QUESTION_ID;
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.outputFile(path.join(courseDir, 'sharedDependency/helper.py'), '# Dependency\n');
    await fs.symlink('sharedDependency', path.join(courseDir, 'serverFilesCourse'), 'dir');
    const syncResults = await util.syncCourseData(courseDir);
    const question = await selectQuestion(syncResults.courseId);

    await fs.appendFile(
      path.join(courseDir, 'sharedDependency', 'helper.py'),
      '# Changed target\n',
    );
    await util.syncCourseData(courseDir);
    expect(await selectVersions(question.id)).toHaveLength(2);

    await fs.writeFile(
      path.join(courseDir, 'questions', util.ALTERNATIVE_QUESTION_ID, 'server.py'),
      '# Template edit\n',
    );
    await util.syncCourseData(courseDir);
    expect(await selectVersions(question.id)).toHaveLength(3);
  });

  it('leaves gaps for invalid or deleted sources and preserves identity across renames', async () => {
    const { courseDir, courseData, syncResults } = await util.createAndSyncCourseData();
    const question = await selectQuestion(syncResults.courseId);
    const infoPath = path.join(courseDir, 'questions', util.QUESTION_ID, 'info.json');
    const original = courseData.questions[util.QUESTION_ID];
    await fs.writeJson(infoPath, { ...original, gradingMethod: 'External' });
    const invalid = await util.syncCourseData(courseDir);
    assert(invalid.status === 'complete');
    const invalidQuestion = invalid.courseData.questions[util.QUESTION_ID];
    expect(invalidQuestion.data).toBeDefined();
    expect(invalidQuestion.errors).not.toHaveLength(0);
    const invalidVersions = await selectVersions(question.id);
    expect(invalidVersions).toHaveLength(1);
    expect(invalidVersions[0].superseded_at).not.toBeNull();

    await fs.writeJson(infoPath, original);
    await util.syncCourseData(courseDir);
    const repaired = await selectVersions(question.id);
    expect(repaired).toHaveLength(2);
    expect(repaired[1].settings).toEqual({
      ...repaired[0].settings,
      question_version_id: repaired[1].question_version.id,
    });
    expect(repaired[1].superseded_at).toBeNull();

    await fs.move(path.dirname(infoPath), path.join(courseDir, 'questions', 'renamed'));
    await util.syncCourseData(courseDir);
    const renamed = await selectVersions(question.id);
    expect(renamed).toHaveLength(3);
    expect(renamed[2].settings?.directory).toBe('renamed');
    expect(renamed[0].settings?.directory).toBe(util.QUESTION_ID);

    await fs.remove(path.join(courseDir, 'questions', 'renamed'));
    await util.syncCourseData(courseDir);
    const deleted = await selectVersions(question.id);
    expect(deleted).toHaveLength(3);
    expect(deleted[2].superseded_at).not.toBeNull();
  });
});
