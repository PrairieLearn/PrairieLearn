import * as path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  ChunkSchema,
  QuestionSchema,
  QuestionVersionSchema,
  QuestionVersionSettingSchema,
} from '../../lib/db-types.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const VersionSchema = z.object({
  question_version: QuestionVersionSchema,
  settings: QuestionVersionSettingSchema.nullable(),
  created_at: z.string(),
  superseded_at: z.string().nullable(),
});

async function selectVersions(courseId: string, questionId: string) {
  return await sqldb.queryRows(
    sql.select_versions,
    { course_id: courseId, question_id: questionId },
    VersionSchema,
  );
}

async function selectQuestion(qid = util.QUESTION_ID) {
  const questions = await util.dumpTableWithSchema('questions', QuestionSchema);
  return questions.find((question) => question.qid === qid && question.deleted_at === null)!;
}

describe('Question version sync without chunks', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);
  beforeEach(helperDb.resetDatabase);

  it('creates settings outside Git, preserves no-ops, and snapshots settings changes', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();
    assert(syncResults.status === 'complete');
    const question = await selectQuestion();
    const initial = await selectVersions(syncResults.courseId, question.id);
    expect(initial).toHaveLength(1);
    expect(initial[0].question_version.commit_hash).toBeNull();
    expect(initial[0].question_version.uses_chunks).toBe(false);
    expect(initial[0].settings).toEqual({
      ...QuestionVersionSettingSchema.omit({ question_version_id: true }).parse(question),
      question_version_id: initial[0].question_version.id,
    });
    expect(await util.dumpTableWithSchema('chunks', ChunkSchema)).toEqual([]);

    await util.syncCourseData(courseDir);
    expect(await selectVersions(syncResults.courseId, question.id)).toEqual(initial);

    await fs.writeJson(path.join(courseDir, 'questions', util.QUESTION_ID, 'info.json'), {
      ...courseData.questions[util.QUESTION_ID],
      title: 'Updated title',
      partialCredit: false,
    });
    await util.syncCourseData(courseDir);
    const changed = await selectVersions(syncResults.courseId, question.id);
    expect(changed).toHaveLength(2);
    expect(changed[0].settings).toEqual(initial[0].settings);
    expect(changed[1].settings?.title).toBe('Updated title');
    expect(changed[1].settings?.partial_credit).toBe(false);
    expect(changed[0].superseded_at).toBe(changed[1].created_at);
  });

  it('detects uncommitted code changes at the same Git hash and writes identical settings again', async () => {
    const courseDir = await util.writeCourseToTempDirectory(util.getCourseData());
    await execa('git', ['init'], { cwd: courseDir });
    await execa('git', ['add', '.'], { cwd: courseDir });
    await execa('git', ['commit', '-m', 'Initial course'], { cwd: courseDir });
    const { stdout: commitHash } = await execa('git', ['rev-parse', 'HEAD'], { cwd: courseDir });
    const result = await util.syncCourseData(courseDir);
    assert(result.status === 'complete');
    const question = await selectQuestion();
    const initial = await selectVersions(result.courseId, question.id);
    expect(initial[0].question_version.commit_hash).toBe(commitHash);

    await fs.writeFile(
      path.join(courseDir, 'questions', util.QUESTION_ID, 'server.py'),
      '# Local edit\n',
    );
    await util.syncCourseData(courseDir);
    const changed = await selectVersions(result.courseId, question.id);
    expect(changed).toHaveLength(2);
    expect(changed[1].question_version.commit_hash).toBe(commitHash);
    expect(changed[1].question_version.source_hash).not.toBe(
      initial[0].question_version.source_hash,
    );
    expect(changed[1].settings).toEqual({
      ...initial[0].settings,
      question_version_id: changed[1].question_version.id,
    });
    await util.syncCourseData(courseDir);
    expect(await selectVersions(result.courseId, question.id)).toEqual(changed);
  });

  it('advances versions for course dependencies and template file changes', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].template = util.ALTERNATIVE_QUESTION_ID;
    const { courseDir, syncResults } = await util.writeAndSyncCourseData(courseData);
    assert(syncResults.status === 'complete');
    const question = await selectQuestion();
    await fs.ensureDir(path.join(courseDir, 'sharedDependency'));
    await fs.symlink('sharedDependency', path.join(courseDir, 'serverFilesCourse'), 'dir');
    await fs.outputFile(path.join(courseDir, 'serverFilesCourse', 'helper.py'), '# Dependency\n');
    await util.syncCourseData(courseDir);
    const dependencyVersions = await selectVersions(syncResults.courseId, question.id);
    expect(dependencyVersions).toHaveLength(2);
    await fs.appendFile(
      path.join(courseDir, 'sharedDependency', 'helper.py'),
      '# Changed target\n',
    );
    await util.syncCourseData(courseDir);
    expect(await selectVersions(syncResults.courseId, question.id)).toHaveLength(3);

    await fs.writeFile(
      path.join(courseDir, 'questions', util.ALTERNATIVE_QUESTION_ID, 'server.py'),
      '# Template edit\n',
    );
    await util.syncCourseData(courseDir);
    expect(await selectVersions(syncResults.courseId, question.id)).toHaveLength(4);
    expect(await util.dumpTableWithSchema('chunks', ChunkSchema)).toEqual([]);
  });

  it('leaves gaps for invalid or deleted sources and preserves identity across renames', async () => {
    const { courseDir, courseData, syncResults } = await util.createAndSyncCourseData();
    assert(syncResults.status === 'complete');
    const question = await selectQuestion();
    const infoPath = path.join(courseDir, 'questions', util.QUESTION_ID, 'info.json');
    const original = courseData.questions[util.QUESTION_ID];
    await fs.writeJson(infoPath, { ...original, gradingMethod: 'External' });
    const invalid = await util.syncCourseData(courseDir);
    assert(invalid.status === 'complete');
    expect(invalid.hadJsonErrors).toBe(true);
    const invalidVersions = await selectVersions(syncResults.courseId, question.id);
    expect(invalidVersions).toHaveLength(1);
    expect(invalidVersions[0].superseded_at).not.toBeNull();

    await fs.writeJson(infoPath, original);
    await util.syncCourseData(courseDir);
    const repaired = await selectVersions(syncResults.courseId, question.id);
    expect(repaired).toHaveLength(2);
    expect(repaired[1].settings).toEqual({
      ...repaired[0].settings,
      question_version_id: repaired[1].question_version.id,
    });
    expect(repaired[1].superseded_at).toBeNull();

    await fs.move(path.dirname(infoPath), path.join(courseDir, 'questions', 'renamed'));
    await util.syncCourseData(courseDir);
    expect((await selectQuestion('renamed')).id).toBe(question.id);
    const renamed = await selectVersions(syncResults.courseId, question.id);
    expect(renamed).toHaveLength(3);
    expect(renamed[2].settings?.directory).toBe('renamed');
    expect(renamed[0].settings?.directory).toBe(util.QUESTION_ID);

    await fs.remove(path.join(courseDir, 'questions', 'renamed'));
    await util.syncCourseData(courseDir);
    const deleted = await selectVersions(syncResults.courseId, question.id);
    expect(deleted).toHaveLength(3);
    expect(deleted[2].superseded_at).not.toBeNull();
  });
});
