import path from 'node:path';

import { S3 } from '@aws-sdk/client-s3';
import fs from 'fs-extra';
import * as tar from 'tar';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { makeS3ClientConfig } from '../lib/aws.js';
import { updateQuestionContentChunk } from '../lib/chunks.js';
import { config } from '../lib/config.js';
import { ChunkSchema } from '../lib/db-types.js';
import { selectQuestionByQid } from '../models/question.js';

import * as helperDb from './helperDb.js';
import * as util from './sync/util.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe('targeted question content chunks', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  it('publishes updated content without replacing an unrelated question chunk', async () => {
    const { courseDir, syncResults } = await util.createAndSyncCourseData();
    const courseId = syncResults.courseId;
    const question = await selectQuestionByQid({ course_id: courseId, qid: util.QUESTION_ID });
    const questionFile = path.join(courseDir, 'questions', util.QUESTION_ID, 'question.html');
    await fs.writeFile(questionFile, '<p>Original content</p>');
    await updateQuestionContentChunk({ coursePath: courseDir, courseId, qid: util.QUESTION_ID });
    await updateQuestionContentChunk({
      coursePath: courseDir,
      courseId,
      qid: util.ALTERNATIVE_QUESTION_ID,
    });
    const before = await sqldb.queryRows(sql.select_chunks, { course_id: courseId }, ChunkSchema);

    await fs.writeFile(questionFile, '<p>Updated content</p>');
    const changes = await updateQuestionContentChunk({
      coursePath: courseDir,
      courseId,
      qid: util.QUESTION_ID,
    });
    assert.deepEqual(changes, {
      updatedChunks: [{ type: 'question', questionName: util.QUESTION_ID }],
      deletedChunks: [],
    });

    const after = await sqldb.queryRows(sql.select_chunks, { course_id: courseId }, ChunkSchema);
    assert.lengthOf(after, 2);
    const updated = after.find((chunk) => chunk.question_id === question.id)!;
    assert.notEqual(updated.uuid, before.find((chunk) => chunk.question_id === question.id)!.uuid);
    const oldOther = before.find((chunk) => chunk.question_id !== question.id)!;
    assert.deepEqual(
      after.find((chunk) => chunk.question_id === oldOther.question_id),
      oldOther,
    );

    const s3 = new S3(makeS3ClientConfig());
    try {
      const response = await s3.getObject({
        Bucket: config.chunksS3Bucket,
        Key: `${updated.uuid}.tar.gz`,
      });
      const archivePath = path.join(courseDir, 'download.tar.gz');
      const unpackedPath = path.join(courseDir, 'download');
      await fs.writeFile(archivePath, await response.Body!.transformToByteArray());
      await fs.ensureDir(unpackedPath);
      await tar.x({ file: archivePath, cwd: unpackedPath });
      assert.equal(
        await fs.readFile(path.join(unpackedPath, 'question.html'), 'utf8'),
        '<p>Updated content</p>',
      );
    } finally {
      s3.destroy();
    }
  });
});
