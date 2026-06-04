import path from 'node:path';

import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { AssessmentQuestionSchema } from '../../lib/db-types.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionByQid } from '../../models/question.js';
import * as helperDb from '../../tests/helperDb.js';
import * as util from '../../tests/sync/util.js';

import { attemptGraphFastSync } from './index.js';

/** The `private` question, worth 10 points, is referenced by the default assessment. */
const QID = 'private';

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

    // Baseline: auto-graded, so all 10 points are auto points.
    const before = await selectAssessmentQuestionsForQuestion(question.id);
    assert.lengthOf(before, 1);
    assert.equal(before[0].max_points, 10);
    assert.equal(before[0].max_auto_points, 10);
    assert.equal(before[0].max_manual_points, 0);

    courseData.questions[QID].gradingMethod = 'Manual';
    await util.writeCourseToDirectory(courseData, courseDir);

    const result = await attemptGraphFastSync(course, [path.join('questions', QID, 'info.json')]);
    assert.isTrue(result.ok);

    // The question itself was updated...
    const updated = await selectQuestionByQid({ course_id: course.id, qid: QID });
    assert.equal(updated.grading_method, 'Manual');

    // ...and the dependent assessment question's split flipped, total unchanged.
    // This is exactly the case the per-case dispatcher bails on.
    const after = await selectAssessmentQuestionsForQuestion(question.id);
    assert.lengthOf(after, 1);
    assert.equal(after[0].max_points, 10);
    assert.equal(after[0].max_auto_points, 0);
    assert.equal(after[0].max_manual_points, 10);
  });

  it('reports the question chunk to regenerate', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();
    const course = await selectCourseById(syncResults.courseId);

    courseData.questions[QID].title = 'Updated title';
    await util.writeCourseToDirectory(courseData, courseDir);

    const result = await attemptGraphFastSync(course, [path.join('questions', QID, 'info.json')]);
    assert.isTrue(result.ok);
    assert.deepEqual(result.chunks, [{ type: 'question', questionName: QID }]);
  });

  it('falls back to full sync when a non-question file also changed', async () => {
    const { syncResults } = await util.createAndSyncCourseData();
    const course = await selectCourseById(syncResults.courseId);

    const result = await attemptGraphFastSync(course, [
      path.join('questions', QID, 'info.json'),
      'infoCourse.json',
    ]);
    assert.isFalse(result.ok);
  });
});
