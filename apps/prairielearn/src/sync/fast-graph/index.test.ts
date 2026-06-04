import fs from 'node:fs/promises';
import path from 'node:path';

import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import type { ChangedFiles } from '../../lib/chunks.js';
import { AssessmentQuestionSchema } from '../../lib/db-types.js';
import { selectCourseById } from '../../models/course.js';
import { selectOptionalQuestionByQid, selectQuestionByQid } from '../../models/question.js';
import * as helperDb from '../../tests/helperDb.js';
import * as util from '../../tests/sync/util.js';

import { attemptGraphFastSync } from './index.js';

/** The `private` question, worth 10 points, is referenced by the default assessment. */
const QID = 'private';
const ASSESSMENT_INFO = path.join(
  'courseInstances',
  util.COURSE_INSTANCE_ID,
  'assessments',
  util.ASSESSMENT_ID,
  'infoAssessment.json',
);

const onlyModified = (modified: string[]): ChangedFiles => ({ modified, deleted: [], renamed: [] });

async function selectAssessmentQuestionsForQuestion(questionId: string) {
  const rows = await util.dumpTableWithSchema('assessment_questions', AssessmentQuestionSchema);
  return rows.filter((aq) => aq.question_id === questionId);
}

describe('graph fast sync', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  it('ripples a question grading-method change to its dependent assessment questions', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();
    const course = await selectCourseById(syncResults.courseId);
    const question = await selectQuestionByQid({ course_id: course.id, qid: QID });

    const before = await selectAssessmentQuestionsForQuestion(question.id);
    assert.lengthOf(before, 1);
    assert.equal(before[0].max_auto_points, 10);
    assert.equal(before[0].max_manual_points, 0);

    courseData.questions[QID].gradingMethod = 'Manual';
    await util.writeCourseToDirectory(courseData, courseDir);

    const result = await attemptGraphFastSync(
      course,
      onlyModified([path.join('questions', QID, 'info.json')]),
    );
    assert.isTrue(result.ok);

    const updated = await selectQuestionByQid({ course_id: course.id, qid: QID });
    assert.equal(updated.grading_method, 'Manual');

    // The dependent assessment was re-synced from disk: the point split flipped,
    // total unchanged.
    const after = await selectAssessmentQuestionsForQuestion(question.id);
    assert.lengthOf(after, 1);
    assert.equal(after[0].max_points, 10);
    assert.equal(after[0].max_auto_points, 0);
    assert.equal(after[0].max_manual_points, 10);
  });

  it('fast-syncs a direct assessment edit', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();
    const course = await selectCourseById(syncResults.courseId);
    const question = await selectQuestionByQid({ course_id: course.id, qid: QID });

    const before = await selectAssessmentQuestionsForQuestion(question.id);
    assert.equal(before[0].max_points, 10);

    const assessment =
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[util.ASSESSMENT_ID];
    assessment.zones![0].questions[0].points = 15;
    await util.writeCourseToDirectory(courseData, courseDir);

    const result = await attemptGraphFastSync(course, onlyModified([ASSESSMENT_INFO]));
    assert.isTrue(result.ok);

    const after = await selectAssessmentQuestionsForQuestion(question.id);
    assert.equal(after[0].max_points, 15);
    assert.equal(after[0].max_auto_points, 15);
  });

  it('fast-syncs a question rename, preserving the question row', async () => {
    const { syncResults } = await util.createAndSyncCourseData();
    const course = await selectCourseById(syncResults.courseId);
    // `test` is not referenced by any assessment, so the rename is self-contained.
    const original = await selectQuestionByQid({ course_id: course.id, qid: util.QUESTION_ID });

    const coursePath = course.path;
    await fs.rename(
      path.join(coursePath, 'questions', util.QUESTION_ID),
      path.join(coursePath, 'questions', 'renamed-question'),
    );

    const result = await attemptGraphFastSync(course, {
      modified: [],
      deleted: [],
      renamed: [
        {
          from: path.join('questions', util.QUESTION_ID, 'info.json'),
          to: path.join('questions', 'renamed-question', 'info.json'),
        },
      ],
    });
    assert.isTrue(result.ok);

    // Same row (same id + uuid), new QID. Old QID no longer resolves.
    const renamed = await selectQuestionByQid({ course_id: course.id, qid: 'renamed-question' });
    assert.equal(renamed.id, original.id);
    assert.equal(renamed.uuid, original.uuid);
    assert.isNull(
      await selectOptionalQuestionByQid({ course_id: course.id, qid: util.QUESTION_ID }),
    );
  });

  it('reports the question chunk to regenerate', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();
    const course = await selectCourseById(syncResults.courseId);

    courseData.questions[QID].title = 'Updated title';
    await util.writeCourseToDirectory(courseData, courseDir);

    const result = await attemptGraphFastSync(
      course,
      onlyModified([path.join('questions', QID, 'info.json')]),
    );
    assert.isTrue(result.ok);
    assert.deepEqual(result.chunks, [{ type: 'question', questionName: QID }]);
  });

  it('falls back to full sync when an unrecognized file also changed', async () => {
    const { syncResults } = await util.createAndSyncCourseData();
    const course = await selectCourseById(syncResults.courseId);

    const result = await attemptGraphFastSync(
      course,
      onlyModified([path.join('questions', QID, 'info.json'), 'infoCourse.json']),
    );
    assert.isFalse(result.ok);
  });
});
