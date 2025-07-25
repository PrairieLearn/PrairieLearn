import * as path from 'path';

import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import {
  AlternativeGroupSchema,
  AssessmentQuestionRolePermissionSchema,
  AssessmentQuestionSchema,
  AssessmentSchema,
  GroupRoleSchema,
  QuestionSchema,
  ZoneSchema,
} from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import type {
  AssessmentJsonInput,
  AssessmentSetJsonInput,
  GroupRoleJsonInput,
} from '../../schemas/index.js';
import * as helperDb from '../helperDb.js';
import { withConfig } from '../utils/config.js';

import * as util from './util.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Makes an empty assessment.
 */
function makeAssessment(
  courseData: util.CourseData,
  type: 'Homework' | 'Exam' = 'Exam',
): AssessmentJsonInput {
  const assessmentSet = courseData.course.assessmentSets?.[0].name ?? '';
  return {
    uuid: uuidv4(),
    type,
    title: 'Test assessment',
    set: assessmentSet,
    number: '1',
    zones: [],
    allowAccess: [],
  };
}

/**
 * Makes a new assessment.
 */
function makeAssessmentSet() {
  return {
    name: 'new assessment set',
    abbreviation: 'new',
    heading: 'a new assessment set to sync',
    color: 'red1',
  } satisfies AssessmentSetJsonInput;
}

function getGroupRoles() {
  return [
    { name: 'Recorder', minimum: 1, maximum: 4, canAssignRoles: true },
    { name: 'Contributor' },
  ] satisfies GroupRoleJsonInput[];
}

function getPermission(permissions, groupRole, assessmentQuestion) {
  return permissions.find(
    (permission) =>
      parseInt(permission.assessment_question_id) === parseInt(assessmentQuestion.id) &&
      parseInt(permission.group_role_id) === parseInt(groupRole.id),
  );
}

async function getSyncedAssessmentData(tid: string) {
  return await sqldb.queryRow(
    sql.get_data_for_assessment,
    { tid },
    z.object({
      assessment: AssessmentSchema,
      zones: z.array(ZoneSchema),
      alternative_groups: z.array(AlternativeGroupSchema),
      assessment_questions: z.array(AssessmentQuestionSchema.extend({ question: QuestionSchema })),
      group_roles: z.array(GroupRoleSchema),
    }),
  );
}

async function findSyncedAssessment(tid) {
  const syncedAssessments = await util.dumpTable('assessments');
  return syncedAssessments.find((a) => a.tid === tid);
}

async function findSyncedUndeletedAssessment(tid) {
  const syncedAssessments = await util.dumpTable('assessments');
  return syncedAssessments.find((a) => a.tid === tid && a.deleted_at == null);
}

describe('Assessment syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  it('allows nesting of assessments in subfolders', async () => {
    const courseData = util.getCourseData();
    const nestedAssessmentStructure = ['subfolder1', 'subfolder2', 'subfolder3', 'nestedQuestion'];
    const assessmentId = nestedAssessmentStructure.join('/');
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[assessmentId] =
      makeAssessment(courseData);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedData = await findSyncedAssessment(assessmentId);
    assert.isOk(syncedData);
  });

  it('adds a new zone to an assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones?.push({
      title: 'zone 1',
      questions: [{ id: util.QUESTION_ID, points: 5 }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    assessment.zones?.push({
      title: 'zone 2',
      questions: [{ id: util.ALTERNATIVE_QUESTION_ID, points: 10 }],
    });
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const syncedData = await getSyncedAssessmentData('newexam');

    assert.lengthOf(syncedData.zones, 2);
    assert.equal(syncedData.zones[0].title, 'zone 1');
    assert.equal(syncedData.zones[1].title, 'zone 2');

    assert.lengthOf(syncedData.alternative_groups, 2);

    assert.lengthOf(syncedData.assessment_questions, 2);
    assert.equal(syncedData.assessment_questions[0].question.qid, util.QUESTION_ID);
    assert.equal(syncedData.assessment_questions[1].question.qid, util.ALTERNATIVE_QUESTION_ID);
  });

  it('defaults shuffleQuestions to true for an Exam-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newexam');
    assert.isTrue(syncedData.assessment.shuffle_questions);
  });

  it('allows shuffleQuestions to be set to false for an Exam-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.shuffleQuestions = false;

    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newexam');
    assert.isFalse(syncedData.assessment.shuffle_questions);
  });

  it('defaults shuffleQuestions to false for a Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newhomework'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newhomework');
    assert.isFalse(syncedData.assessment.shuffle_questions);
  });

  it('allows shuffleQuestions to be set to true for a Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.shuffleQuestions = true;

    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newhomework'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newhomework');
    assert.isTrue(syncedData.assessment.shuffle_questions);
  });

  it('syncs alternatives in an Exam zone', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones?.push({
      title: 'zone 1',
      questions: [
        {
          points: 10,
          alternatives: [
            {
              id: util.QUESTION_ID,
            },
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              points: 5,
            },
          ],
        },
        {
          points: 7,
          id: util.MANUAL_GRADING_QUESTION_ID,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newexam');
    assert.lengthOf(syncedData.zones, 1);
    assert.lengthOf(syncedData.alternative_groups, 2);
    assert.lengthOf(syncedData.assessment_questions, 3);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.ok(firstAssessmentQuestion);
    assert.equal(firstAssessmentQuestion.max_points, 10);
    assert.equal(firstAssessmentQuestion.max_auto_points, 10);
    assert.deepEqual(firstAssessmentQuestion.points_list, [10]);
    assert.equal(firstAssessmentQuestion.max_manual_points, 0);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.ok(secondAssessmentQuestion);
    assert.equal(secondAssessmentQuestion.max_points, 5);
    assert.equal(secondAssessmentQuestion.max_auto_points, 5);
    assert.deepEqual(secondAssessmentQuestion.points_list, [5]);
    assert.equal(secondAssessmentQuestion.max_manual_points, 0);

    const thirdAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.MANUAL_GRADING_QUESTION_ID,
    );
    assert.ok(thirdAssessmentQuestion);
    assert.equal(thirdAssessmentQuestion.max_points, 7);
    assert.equal(thirdAssessmentQuestion.max_auto_points, 0);
    assert.deepEqual(thirdAssessmentQuestion.points_list, [7]);
    assert.equal(thirdAssessmentQuestion.max_manual_points, 7);
  });

  it('syncs alternatives in a Homework zone', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones?.push({
      title: 'zone 1',
      questions: [
        {
          maxPoints: 20,
          points: 10,
          alternatives: [
            {
              id: util.QUESTION_ID,
            },
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              maxPoints: 15,
              points: 5,
            },
          ],
        },
        {
          points: 7,
          id: util.MANUAL_GRADING_QUESTION_ID,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newexam');
    assert.lengthOf(syncedData.zones, 1);
    assert.lengthOf(syncedData.alternative_groups, 2);
    assert.lengthOf(syncedData.assessment_questions, 3);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.ok(firstAssessmentQuestion);
    assert.equal(firstAssessmentQuestion.init_points, 10);
    assert.equal(firstAssessmentQuestion.max_points, 20);
    assert.equal(firstAssessmentQuestion.max_auto_points, 20);
    assert.equal(firstAssessmentQuestion.max_manual_points, 0);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.ok(secondAssessmentQuestion);
    assert.equal(secondAssessmentQuestion.init_points, 5);
    assert.equal(secondAssessmentQuestion.max_points, 15);
    assert.equal(secondAssessmentQuestion.max_auto_points, 15);
    assert.equal(secondAssessmentQuestion.max_manual_points, 0);

    const thirdAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.MANUAL_GRADING_QUESTION_ID,
    );
    assert.ok(thirdAssessmentQuestion);
    assert.equal(thirdAssessmentQuestion.init_points, 7);
    assert.equal(thirdAssessmentQuestion.max_points, 7);
    assert.equal(thirdAssessmentQuestion.max_auto_points, 0);
    assert.equal(thirdAssessmentQuestion.max_manual_points, 7);
  });

  it('syncs auto and manual points in an Exam zone', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones?.push({
      title: 'zone 1',
      questions: [
        {
          autoPoints: 10,
          manualPoints: 3,
          alternatives: [
            {
              id: util.QUESTION_ID,
            },
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              autoPoints: 5,
            },
          ],
        },
        {
          autoPoints: 1,
          manualPoints: 7,
          id: util.MANUAL_GRADING_QUESTION_ID,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newexam');
    assert.lengthOf(syncedData.zones, 1);
    assert.lengthOf(syncedData.alternative_groups, 2);
    assert.lengthOf(syncedData.assessment_questions, 3);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.ok(firstAssessmentQuestion);
    assert.equal(firstAssessmentQuestion.max_points, 13);
    assert.equal(firstAssessmentQuestion.max_auto_points, 10);
    assert.deepEqual(firstAssessmentQuestion.points_list, [13]);
    assert.equal(firstAssessmentQuestion.max_manual_points, 3);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.ok(secondAssessmentQuestion);
    assert.equal(secondAssessmentQuestion.max_points, 8);
    assert.equal(secondAssessmentQuestion.max_auto_points, 5);
    assert.deepEqual(secondAssessmentQuestion.points_list, [8]);
    assert.equal(secondAssessmentQuestion.max_manual_points, 3);

    const thirdAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.MANUAL_GRADING_QUESTION_ID,
    );
    assert.ok(thirdAssessmentQuestion);
    assert.equal(thirdAssessmentQuestion.max_points, 8);
    assert.equal(thirdAssessmentQuestion.max_auto_points, 1);
    assert.deepEqual(thirdAssessmentQuestion.points_list, [8]);
    assert.equal(thirdAssessmentQuestion.max_manual_points, 7);
  });

  it('syncs auto and manual points in a Homework zone', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones?.push({
      title: 'zone 1',
      questions: [
        {
          maxAutoPoints: 20,
          autoPoints: 10,
          manualPoints: 3,
          alternatives: [
            {
              id: util.QUESTION_ID,
            },
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              maxAutoPoints: 15,
              autoPoints: 5,
            },
          ],
        },
        {
          autoPoints: 1,
          manualPoints: 7,
          id: util.MANUAL_GRADING_QUESTION_ID,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['hwwithmanual1'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('hwwithmanual1');
    assert.lengthOf(syncedData.zones, 1);
    assert.lengthOf(syncedData.alternative_groups, 2);
    assert.lengthOf(syncedData.assessment_questions, 3);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.ok(firstAssessmentQuestion);
    assert.equal(firstAssessmentQuestion.init_points, 13);
    assert.equal(firstAssessmentQuestion.max_points, 23);
    assert.equal(firstAssessmentQuestion.max_auto_points, 20);
    assert.equal(firstAssessmentQuestion.max_manual_points, 3);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.ok(secondAssessmentQuestion);
    assert.equal(secondAssessmentQuestion.init_points, 8);
    assert.equal(secondAssessmentQuestion.max_points, 18);
    assert.equal(secondAssessmentQuestion.max_auto_points, 15);
    assert.equal(secondAssessmentQuestion.max_manual_points, 3);

    const thirdAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.MANUAL_GRADING_QUESTION_ID,
    );
    assert.ok(thirdAssessmentQuestion);
    assert.equal(thirdAssessmentQuestion.init_points, 8);
    assert.equal(thirdAssessmentQuestion.max_points, 8);
    assert.equal(thirdAssessmentQuestion.max_auto_points, 1);
    assert.equal(thirdAssessmentQuestion.max_manual_points, 7);
  });

  it('syncs point arrays in an Exam zone', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones?.push({
      title: 'zone 1',
      questions: [
        {
          points: [10, 7, 5, 2, 1],
          alternatives: [
            {
              id: util.QUESTION_ID,
            },
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              points: [5, 3],
            },
          ],
        },
        {
          points: [7, 6, 5],
          id: util.MANUAL_GRADING_QUESTION_ID,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newexam');
    assert.lengthOf(syncedData.zones, 1);
    assert.lengthOf(syncedData.alternative_groups, 2);
    assert.lengthOf(syncedData.assessment_questions, 3);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.ok(firstAssessmentQuestion);
    assert.equal(firstAssessmentQuestion.max_points, 10);
    assert.equal(firstAssessmentQuestion.max_auto_points, 10);
    assert.deepEqual(firstAssessmentQuestion.points_list, [10, 7, 5, 2, 1]);
    assert.equal(firstAssessmentQuestion.max_manual_points, 0);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.ok(secondAssessmentQuestion);
    assert.equal(secondAssessmentQuestion.max_points, 5);
    assert.equal(secondAssessmentQuestion.max_auto_points, 5);
    assert.deepEqual(secondAssessmentQuestion.points_list, [5, 3]);
    assert.equal(secondAssessmentQuestion.max_manual_points, 0);

    const thirdAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.MANUAL_GRADING_QUESTION_ID,
    );
    assert.ok(thirdAssessmentQuestion);
    assert.equal(thirdAssessmentQuestion.max_points, 7);
    assert.equal(thirdAssessmentQuestion.max_auto_points, 0);
    assert.deepEqual(thirdAssessmentQuestion.points_list, [7, 6, 5]);
    assert.equal(thirdAssessmentQuestion.max_manual_points, 7);
  });

  it('syncs autoPoint arrays in an Exam zone', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones?.push({
      title: 'zone 1',
      questions: [
        {
          autoPoints: [10, 7, 5, 2, 1],
          manualPoints: 8,
          alternatives: [
            {
              id: util.QUESTION_ID,
            },
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              autoPoints: [5, 3],
            },
          ],
        },
        {
          autoPoints: [7, 6, 5],
          manualPoints: 3,
          id: util.MANUAL_GRADING_QUESTION_ID,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newexam');
    assert.lengthOf(syncedData.zones, 1);
    assert.lengthOf(syncedData.alternative_groups, 2);
    assert.lengthOf(syncedData.assessment_questions, 3);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.ok(firstAssessmentQuestion);
    assert.equal(firstAssessmentQuestion.max_points, 18);
    assert.equal(firstAssessmentQuestion.max_auto_points, 10);
    assert.deepEqual(firstAssessmentQuestion.points_list, [18, 15, 13, 10, 9]);
    assert.equal(firstAssessmentQuestion.max_manual_points, 8);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.ok(secondAssessmentQuestion);
    assert.equal(secondAssessmentQuestion.max_points, 13);
    assert.equal(secondAssessmentQuestion.max_auto_points, 5);
    assert.deepEqual(secondAssessmentQuestion.points_list, [13, 11]);
    assert.equal(secondAssessmentQuestion.max_manual_points, 8);

    const thirdAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.MANUAL_GRADING_QUESTION_ID,
    );
    assert.ok(thirdAssessmentQuestion);
    assert.equal(thirdAssessmentQuestion.max_points, 10);
    assert.equal(thirdAssessmentQuestion.max_auto_points, 7);
    assert.deepEqual(thirdAssessmentQuestion.points_list, [10, 9, 8]);
    assert.equal(thirdAssessmentQuestion.max_manual_points, 3);
  });

  it('reuses assessment questions when questions are removed and added again', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            id: util.QUESTION_ID,
            points: 5,
          },
          {
            id: util.ALTERNATIVE_QUESTION_ID,
            points: 10,
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    let syncedData = await getSyncedAssessmentData('newexam');

    const originalFirstSyncedAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.ok(originalFirstSyncedAssessmentQuestion);

    const originalSecondSyncedAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.ok(originalSecondSyncedAssessmentQuestion);

    const removedQuestion = assessment.zones[0].questions?.shift();
    if (!removedQuestion) throw new Error('removedQuestion is null');
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedData = await getSyncedAssessmentData('newexam');
    const deletedFirstSyncedAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.isOk(deletedFirstSyncedAssessmentQuestion);
    assert.isNotNull(deletedFirstSyncedAssessmentQuestion.deleted_at);

    assessment.zones[0].questions?.push(removedQuestion);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedData = await getSyncedAssessmentData('newexam');

    const newFirstSyncedAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.ok(newFirstSyncedAssessmentQuestion);
    const newSecondSyncedAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.ok(newSecondSyncedAssessmentQuestion);

    // The questions were reordered, but they should still have the same assessment question IDs
    assert.equal(newFirstSyncedAssessmentQuestion.id, originalSecondSyncedAssessmentQuestion.id);
    assert.equal(newSecondSyncedAssessmentQuestion.id, originalFirstSyncedAssessmentQuestion.id);
  });

  it('removes a zone from an assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones?.push({
      title: 'zone 1',
      questions: [{ id: util.QUESTION_ID, points: 5 }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    assessment.zones?.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const syncedData = await getSyncedAssessmentData('newexam');

    assert.lengthOf(syncedData.zones, 0);
    assert.lengthOf(syncedData.alternative_groups, 0);
    assert.lengthOf(syncedData.assessment_questions, 1);
    assert.isNotNull(syncedData.assessment_questions[0].deleted_at);
  });

  it('removes an access rule from an exam', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess?.push(
      {
        mode: 'Exam',
      },
      {
        mode: 'Public',
      },
    );
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    const syncedAssessments = await util.dumpTable('assessments');
    const originalSyncedAssessment = syncedAssessments.find((a) => a.tid === 'newexam');

    assessment.allowAccess?.shift();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentAccessRules = await util.dumpTable('assessment_access_rules');
    const rulesForAssessment = syncedAssessmentAccessRules.filter((aar) =>
      idsEqual(aar.assessment_id, originalSyncedAssessment?.id),
    );
    assert.lengthOf(rulesForAssessment, 1);
    assert.equal(rulesForAssessment[0].mode, 'Public');
  });

  it('sets mode to Exam if an access rule specifies an examUuid but not mode=Exam', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess?.push({
      examUuid: 'f593a8c9-ccd4-449c-936c-c26c96ea089b',
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['implicitexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('implicitexam');
    const syncedAssessmentAccessRules = await util.dumpTable('assessment_access_rules');
    const rulesForAssessment = syncedAssessmentAccessRules.filter((aar) =>
      idsEqual(aar.assessment_id, syncedAssessment?.id),
    );
    assert.lengthOf(rulesForAssessment, 1);
    assert.equal(rulesForAssessment[0].mode, 'Exam');
    assert.equal(rulesForAssessment[0].exam_uuid, 'f593a8c9-ccd4-449c-936c-c26c96ea089b');
  });

  it('syncs empty arrays correctly', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    // NOTE: our JSON schema explicitly prohibits a zone question from having
    // an empty points array, so we can't test that here as it's impossible
    // for it to ever be written to the database.
    assessment.allowAccess?.push({
      mode: 'Exam',
      uids: [],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessments = await util.dumpTable('assessments');
    const syncedAssessment = syncedAssessments.find((a) => a.tid === 'newexam');

    const assessmentAccessRules = await util.dumpTable('assessment_access_rules');
    const assessmentAccessRule = assessmentAccessRules.find((aar) =>
      idsEqual(aar.assessment_id, syncedAssessment?.id),
    );
    assert.isArray(assessmentAccessRule?.uids, 'uids should be an array');
    assert.isEmpty(assessmentAccessRule?.uids, 'uids should be empty');
  });

  it('syncs group roles correctly', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupRoles = getGroupRoles();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessment'] =
      groupAssessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedRoles = await util.dumpTable('group_roles');
    assert.equal(syncedRoles.length, 2);

    const recorder = syncedRoles.find((role) => role.role_name === 'Recorder');
    assert.isDefined(recorder);
    assert.equal(recorder?.minimum, 1);
    assert.equal(recorder?.maximum, 4);
    assert.isTrue(recorder?.can_assign_roles);

    const contributor = syncedRoles.find((role) => role.role_name === 'Contributor');
    assert.isOk(contributor);
    assert.equal(contributor?.minimum, 0);
    assert.equal(contributor?.maximum, null);
    assert.isFalse(contributor?.can_assign_roles);
  });

  it('syncs group roles and valid question-level permissions correctly', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupRoles = getGroupRoles();
    groupAssessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
          canView: ['Recorder', 'Contributor'],
          canSubmit: ['Recorder'],
        },
        {
          id: util.ALTERNATIVE_QUESTION_ID,
          points: 5,
          canView: ['Recorder'],
          canSubmit: ['Recorder'],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessment'] =
      groupAssessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('groupAssessment');
    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );

    // Check group roles
    const syncedRoles = await util.dumpTable('group_roles');
    assert.isTrue(syncedRoles.length === 2);

    const recorder = syncedRoles.find((role) => role.role_name === 'Recorder');
    const contributor = syncedRoles.find((role) => role.role_name === 'Contributor');
    assert.isDefined(recorder);
    assert.isDefined(contributor);

    // Check question role permissions
    const syncedPermissions = await util.dumpTable('assessment_question_role_permissions');

    const firstQuestionRecorderPermission = getPermission(
      syncedPermissions,
      recorder,
      firstAssessmentQuestion,
    );
    assert.isDefined(firstQuestionRecorderPermission);
    assert.isTrue(
      firstQuestionRecorderPermission?.can_view && firstQuestionRecorderPermission?.can_submit,
      'recorder should have permission to view and submit first question',
    );

    const firstQuestionContributorPermission = getPermission(
      syncedPermissions,
      contributor,
      firstAssessmentQuestion,
    );
    assert.isDefined(firstQuestionContributorPermission);
    assert.isTrue(
      firstQuestionContributorPermission?.can_view &&
        !firstQuestionContributorPermission?.can_submit,
      'contributor should only have permission to view first question',
    );

    const secondQuestionRecorderPermission = getPermission(
      syncedPermissions,
      recorder,
      secondAssessmentQuestion,
    );
    assert.isDefined(secondQuestionRecorderPermission);
    assert.isTrue(
      secondQuestionRecorderPermission?.can_view && secondQuestionRecorderPermission?.can_submit,
      'recorder should have permission to view and submit second question',
    );

    const secondQuestionContributorPermission = getPermission(
      syncedPermissions,
      contributor,
      secondAssessmentQuestion,
    );
    assert.isOk(secondQuestionContributorPermission);
    assert.isTrue(
      !secondQuestionContributorPermission?.can_view &&
        !secondQuestionContributorPermission?.can_submit,
      'contributor should not be able to view or submit second question',
    );
  });

  it('syncs group roles and valid zone-level permissions correctly', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupRoles = getGroupRoles();
    groupAssessment.zones?.push({
      title: 'test zone',
      canView: ['Recorder', 'Contributor'],
      canSubmit: ['Recorder'],
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
        },
        {
          id: util.ALTERNATIVE_QUESTION_ID,
          points: 5,
          canView: ['Recorder'],
          canSubmit: ['Recorder'],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessment'] =
      groupAssessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('groupAssessment');
    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );

    // Check group roles
    const syncedRoles = await util.dumpTable('group_roles');
    assert.isTrue(syncedRoles.length === 2);

    const recorder = syncedRoles.find((role) => role.role_name === 'Recorder');
    const contributor = syncedRoles.find((role) => role.role_name === 'Contributor');
    assert.isDefined(recorder);
    assert.isDefined(contributor);

    // Check question role permissions
    const syncedPermissions = await util.dumpTable('assessment_question_role_permissions');

    const firstQuestionRecorderPermission = getPermission(
      syncedPermissions,
      recorder,
      firstAssessmentQuestion,
    );
    assert.isDefined(firstQuestionRecorderPermission);
    assert.isTrue(
      firstQuestionRecorderPermission?.can_view && firstQuestionRecorderPermission?.can_submit,
      'recorder should have permission to view and submit first question',
    );

    const firstQuestionContributorPermission = getPermission(
      syncedPermissions,
      contributor,
      firstAssessmentQuestion,
    );
    assert.isDefined(firstQuestionContributorPermission);
    assert.isTrue(
      firstQuestionContributorPermission?.can_view &&
        !firstQuestionContributorPermission?.can_submit,
      'contributor should only have permission to view first question',
    );

    const secondQuestionRecorderPermission = getPermission(
      syncedPermissions,
      recorder,
      secondAssessmentQuestion,
    );
    assert.isDefined(secondQuestionRecorderPermission);
    assert.isTrue(
      secondQuestionRecorderPermission?.can_view && secondQuestionRecorderPermission?.can_submit,
      'recorder should have permission to view and submit second question',
    );

    const secondQuestionContributorPermission = getPermission(
      syncedPermissions,
      contributor,
      secondAssessmentQuestion,
    );
    assert.isOk(secondQuestionContributorPermission);
    assert.isTrue(
      !secondQuestionContributorPermission?.can_view &&
        !secondQuestionContributorPermission?.can_submit,
      'contributor should not be able to view or submit second question',
    );
  });

  it('syncs group roles and valid assessment-level permissions correctly', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupRoles = getGroupRoles();
    groupAssessment.canView = ['Recorder', 'Contributor'];
    groupAssessment.canSubmit = ['Recorder'];
    groupAssessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
        },
        {
          id: util.ALTERNATIVE_QUESTION_ID,
          points: 5,
          canView: ['Recorder'],
          canSubmit: ['Recorder'],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessment'] =
      groupAssessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('groupAssessment');
    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );

    // Check group roles
    const syncedRoles = await util.dumpTable('group_roles');
    assert.isTrue(syncedRoles.length === 2);

    const recorder = syncedRoles.find((role) => role.role_name === 'Recorder');
    const contributor = syncedRoles.find((role) => role.role_name === 'Contributor');
    assert.isDefined(recorder);
    assert.isDefined(contributor);

    // Check question role permissions
    const syncedPermissions = await util.dumpTable('assessment_question_role_permissions');

    const firstQuestionRecorderPermission = getPermission(
      syncedPermissions,
      recorder,
      firstAssessmentQuestion,
    );
    assert.isDefined(firstQuestionRecorderPermission);
    assert.isTrue(
      firstQuestionRecorderPermission?.can_view && firstQuestionRecorderPermission?.can_submit,
      'recorder should have permission to view and submit first question',
    );

    const firstQuestionContributorPermission = getPermission(
      syncedPermissions,
      contributor,
      firstAssessmentQuestion,
    );
    assert.isDefined(firstQuestionContributorPermission);
    assert.isTrue(
      firstQuestionContributorPermission?.can_view &&
        !firstQuestionContributorPermission?.can_submit,
      'contributor should only have permission to view first question',
    );

    const secondQuestionRecorderPermission = getPermission(
      syncedPermissions,
      recorder,
      secondAssessmentQuestion,
    );
    assert.isDefined(secondQuestionRecorderPermission);
    assert.isTrue(
      secondQuestionRecorderPermission?.can_view && secondQuestionRecorderPermission?.can_submit,
      'recorder should have permission to view and submit second question',
    );

    const secondQuestionContributorPermission = getPermission(
      syncedPermissions,
      contributor,
      secondAssessmentQuestion,
    );
    assert.isOk(secondQuestionContributorPermission);
    assert.isTrue(
      !secondQuestionContributorPermission?.can_view &&
        !secondQuestionContributorPermission?.can_submit,
      'contributor should not be able to view or submit second question',
    );
  });

  it('removes group roles and role permissions correctly upon re-sync', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupRoles = getGroupRoles();
    groupAssessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
          canView: ['Recorder', 'Contributor'],
          canSubmit: ['Recorder'],
        },
        {
          id: util.ALTERNATIVE_QUESTION_ID,
          points: 5,
          canView: ['Recorder', 'Contributor'],
          canSubmit: ['Recorder', 'Contributor'],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessment'] =
      groupAssessment;

    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // Check group roles
    const syncedRoles = await util.dumpTable('group_roles');
    assert.equal(syncedRoles.length, 2);
    const foundRecorder = syncedRoles.find((role) => role.role_name === 'Recorder');
    const foundContributor = syncedRoles.find((role) => role.role_name === 'Contributor');
    assert.isDefined(foundRecorder);
    assert.isDefined(foundContributor);

    // Check permissions
    const syncedPermissions = await util.dumpTable('assessment_question_role_permissions');
    assert.equal(
      syncedPermissions.filter((p) => parseInt(p.group_role_id) === parseInt(foundRecorder?.id))
        .length,
      2,
    );
    assert.equal(
      syncedPermissions.filter((p) => parseInt(p.group_role_id) === parseInt(foundContributor?.id))
        .length,
      2,
    );

    // Remove the "Contributor" group role and re-sync
    groupAssessment.groupRoles = [
      { name: 'Recorder', minimum: 1, maximum: 4, canAssignRoles: true },
    ];
    const lastZone = groupAssessment?.zones?.[groupAssessment.zones.length - 1];
    if (!lastZone) throw new Error('could not find last zone');
    lastZone.questions = [
      {
        id: util.QUESTION_ID,
        points: 5,
        canView: ['Recorder'],
        canSubmit: ['Recorder'],
      },
      {
        id: util.ALTERNATIVE_QUESTION_ID,
        points: 5,
        canView: ['Recorder'],
        canSubmit: ['Recorder'],
      },
    ];

    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedRoles = await util.dumpTable('group_roles');
    assert.equal(newSyncedRoles.length, 1);
    assert.notEqual(
      newSyncedRoles.find((role) => role.role_name === 'Recorder'),
      undefined,
    );
    assert.isUndefined(newSyncedRoles.find((role) => role.role_name === 'Contributor'));

    const newSyncedPermissions = await util.dumpTable('assessment_question_role_permissions');
    assert.equal(
      newSyncedPermissions.filter((p) => parseInt(p.group_role_id) === parseInt(foundRecorder?.id))
        .length,
      2,
    );
    assert.equal(
      newSyncedPermissions.filter(
        (p) => parseInt(p.group_role_id) === parseInt(foundContributor?.id),
      ).length,
      0,
    );
  });

  it('records an error if a question has permissions for non-existent group roles', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupRoles = getGroupRoles();
    groupAssessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
          canView: ['Recorder', 'Invalid'],
          canSubmit: ['Recorder'],
        },
        {
          id: util.ALTERNATIVE_QUESTION_ID,
          points: 5,
          canView: ['Recorder', 'Contributor'],
          canSubmit: ['Recorder', 'Contributor'],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessmentFail'] =
      groupAssessment;

    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('groupAssessmentFail');

    assert.match(
      syncedAssessment?.sync_errors,
      /The zone question's "canView" permission contains the non-existent group role name "Invalid"./,
    );
  });

  it('records an error if a zone has permissions for non-existent group roles', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupRoles = getGroupRoles();
    groupAssessment.zones?.push({
      title: 'test zone',
      canView: ['Recorder', 'Invalid'],
      canSubmit: ['Recorder'],
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
        },
        {
          id: util.ALTERNATIVE_QUESTION_ID,
          points: 5,
          canView: ['Recorder', 'Contributor'],
          canSubmit: ['Recorder', 'Contributor'],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessmentFail'] =
      groupAssessment;

    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('groupAssessmentFail');

    assert.match(
      syncedAssessment?.sync_errors,
      /The zone's "canView" permission contains the non-existent group role name "Invalid"./,
    );
  });

  it('records an error if an assessment has permissions for non-existent group roles', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupRoles = getGroupRoles();
    groupAssessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
        },
        {
          id: util.ALTERNATIVE_QUESTION_ID,
          points: 5,
          canView: ['Recorder', 'Contributor'],
          canSubmit: ['Recorder', 'Contributor'],
        },
      ],
    });
    groupAssessment.canView = ['Recorder', 'Invalid'];
    groupAssessment.canSubmit = ['Recorder'];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessmentFail'] =
      groupAssessment;

    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('groupAssessmentFail');

    assert.match(
      syncedAssessment?.sync_errors,
      /The assessment's "canView" permission contains the non-existent group role name "Invalid"./,
    );
  });

  it('records an error if there is no group role with minimum > 0 that can reassign roles', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupRoles = [{ name: 'Recorder', canAssignRoles: false }];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessmentFail'] =
      groupAssessment;

    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('groupAssessmentFail');

    assert.match(
      syncedAssessment?.sync_errors,
      /Could not find a role with minimum >= 1 and "canAssignRoles" set to "true"./,
    );
  });

  it('records an error if group role max/min are greater than the group maximum', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupMaxSize = 4;
    groupAssessment.groupRoles = [
      { name: 'Manager', canAssignRoles: true, minimum: 10 },
      { name: 'Reflector', maximum: 10 },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessmentFail'] =
      groupAssessment;

    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('groupAssessmentFail');

    assert.match(
      syncedAssessment?.sync_errors,
      /Group role "Manager" contains an invalid minimum. \(Expected at most 4, found 10\)./,
    );
    assert.match(
      syncedAssessment?.sync_errors,
      /Group role "Reflector" contains an invalid maximum. \(Expected at most 4, found 10\)./,
    );
  });

  it('removes deleted question-level permissions correctly', async () => {
    const courseData = util.getCourseData();
    const groupAssessment = makeAssessment(courseData, 'Homework');
    groupAssessment.groupWork = true;
    groupAssessment.groupRoles = [
      { name: 'Recorder', minimum: 1, maximum: 4, canAssignRoles: true },
      { name: 'Contributor' },
    ];
    groupAssessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
          canView: ['Recorder', 'Contributor'],
          canSubmit: ['Recorder'],
        },
        {
          id: util.ALTERNATIVE_QUESTION_ID,
          points: 5,
          canView: ['Recorder', 'Contributor'],
          canSubmit: ['Recorder', 'Contributor'],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['groupAssessment'] =
      groupAssessment;

    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    const syncedRoles = await util.dumpTable('group_roles');

    // Ensure both roles are present
    assert.equal(syncedRoles.length, 2);
    const foundRecorder = syncedRoles.find((role) => role.role_name === 'Recorder');
    const foundContributor = syncedRoles.find((role) => role.role_name === 'Contributor');
    assert.isDefined(foundRecorder);
    assert.isDefined(foundContributor);

    // Modify question-level permissions
    const lastZone = groupAssessment?.zones?.[groupAssessment.zones.length - 1];
    if (!lastZone) throw new Error('could not find last zone');
    lastZone.questions = [
      {
        id: util.QUESTION_ID,
        points: 5,
        canView: ['Recorder'],
        canSubmit: ['Recorder'],
      },
      {
        id: util.ALTERNATIVE_QUESTION_ID,
        points: 5,
        canView: ['Recorder', 'Contributor'],
        canSubmit: ['Recorder'],
      },
    ];

    // Overwrite and ensure that both roles are still present
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedRoles = await util.dumpTable('group_roles');
    assert.equal(newSyncedRoles.length, 2);

    const syncedData = await getSyncedAssessmentData('groupAssessment');
    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );

    assert.ok(firstAssessmentQuestion);
    assert.ok(secondAssessmentQuestion);

    const newSyncedPermissions = await util.dumpTable('assessment_question_role_permissions');
    // Contributor can no longer view QUESTION_ID
    const firstQuestionContributorPermission = newSyncedPermissions.find(
      (p) =>
        parseInt(p.assessment_question_id) === parseInt(firstAssessmentQuestion.id) &&
        parseInt(p.group_role_id) === parseInt(foundContributor?.id),
    );
    assert.isFalse(firstQuestionContributorPermission?.can_view);
    assert.isFalse(firstQuestionContributorPermission?.can_submit);

    // Contributor can view ALTERNATIVE_QUESTION_ID, but not submit
    const secondQuestionContributorPermission = newSyncedPermissions.find(
      (p) =>
        parseInt(p.assessment_question_id) === parseInt(secondAssessmentQuestion.id) &&
        parseInt(p.group_role_id) === parseInt(foundContributor?.id),
    );
    assert.isTrue(secondQuestionContributorPermission?.can_view);
    assert.isFalse(secondQuestionContributorPermission?.can_submit);
  });

  // At one point we were missing a `WHERE` clause in the syncing code, which caused
  // excess `assessment_question_role_permissions` to be created. This test ensures
  // that this bug is fixed.
  it('isolates roles/permissions to the assessment they are defined in', async () => {
    const courseData = util.getCourseData();

    const firstGroupAssessment = makeAssessment(courseData, 'Homework');
    firstGroupAssessment.groupWork = true;
    firstGroupAssessment.groupRoles = [{ name: 'Recorder', minimum: 1, canAssignRoles: true }];
    firstGroupAssessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
          canView: ['Recorder'],
          canSubmit: ['Recorder'],
        },
      ],
    });

    const secondGroupAssessment = makeAssessment(courseData, 'Homework');
    secondGroupAssessment.groupWork = true;
    secondGroupAssessment.groupRoles = [{ name: 'Recorder', minimum: 1, canAssignRoles: true }];
    secondGroupAssessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
          canView: ['Recorder'],
          canSubmit: ['Recorder'],
        },
      ],
    });

    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['firstGroupAssessment'] =
      firstGroupAssessment;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['secondGroupAssessment'] =
      secondGroupAssessment;

    await util.writeAndSyncCourseData(courseData);

    const firstSyncedAssessment = await getSyncedAssessmentData('firstGroupAssessment');
    const secondSyncedAssessment = await getSyncedAssessmentData('secondGroupAssessment');
    assert.lengthOf(firstSyncedAssessment.group_roles, 1);
    assert.lengthOf(secondSyncedAssessment.group_roles, 1);

    const syncedPermissions = await util.dumpTableWithSchema(
      'assessment_question_role_permissions',
      AssessmentQuestionRolePermissionSchema,
    );
    assert.lengthOf(syncedPermissions, 2);

    const firstAssessmentQuestion = firstSyncedAssessment.assessment_questions[0];
    const firstGroupRole = firstSyncedAssessment.group_roles[0];
    assert.ok(firstAssessmentQuestion);
    assert.ok(firstGroupRole);

    const secondAssessmentQuestion = secondSyncedAssessment.assessment_questions[0];
    const secondGroupRole = secondSyncedAssessment.group_roles[0];
    assert.ok(secondAssessmentQuestion);
    assert.ok(secondGroupRole);

    const firstQuestionPermission = syncedPermissions.find((p) => {
      return (
        p.assessment_question_id === firstAssessmentQuestion.id &&
        p.group_role_id === firstGroupRole.id
      );
    });
    assert.ok(firstQuestionPermission);

    const secondQuestionPermission = syncedPermissions.find((p) => {
      return (
        p.assessment_question_id === secondAssessmentQuestion.id &&
        p.group_role_id === secondGroupRole.id
      );
    });
    assert.ok(secondQuestionPermission);
  });

  it('handles assessment sets that are not present in infoCourse.json', async () => {
    // Missing assessment sets should be created
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    const missingAssessmentSetName = 'missing assessment set name';
    assessment.set = missingAssessmentSetName;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['new'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    let syncedAssessmentSets = await util.dumpTable('assessment_sets');
    let syncedAssessmentSet = syncedAssessmentSets.find(
      (aset) => aset.name === missingAssessmentSetName,
    );
    assert.isOk(syncedAssessmentSet);
    assert.isTrue(syncedAssessmentSet.implicit);
    assert.isTrue(
      syncedAssessmentSet?.heading && syncedAssessmentSet.heading.length > 0,
      'assessment set should not have empty heading',
    );

    // When missing assessment sets are no longer used in any assessments, they should
    // be removed from the DB
    assessment.set = 'Homework';
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedAssessmentSets = await util.dumpTable('assessment_sets');
    syncedAssessmentSet = syncedAssessmentSets.find(
      (aset) => aset.name === missingAssessmentSetName,
    );
    assert.isUndefined(syncedAssessmentSet);
  });

  it('handles assessment modules that are not present in infoCourse.json', async () => {
    // Missing assessment modules should be created
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    const missingAssessmentModuleName = 'missing assessment module name';
    assessment.module = missingAssessmentModuleName;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['new'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    let syncedAssessmentModules = await util.dumpTable('assessment_modules');
    let syncedAssessmentModule = syncedAssessmentModules.find(
      (amod) => amod.name === missingAssessmentModuleName,
    );
    assert.isOk(syncedAssessmentModule);
    assert.isTrue(syncedAssessmentModule.implicit);
    assert.isTrue(
      syncedAssessmentModule?.heading && syncedAssessmentModule.heading.length > 0,
      'assessment module should not have empty heading',
    );

    // When missing assessment modules are no longer used in any assessments, they should
    // be removed from the DB
    delete assessment.module;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedAssessmentModules = await util.dumpTable('assessment_modules');
    syncedAssessmentModule = syncedAssessmentModules.find(
      (amod) => amod.name === missingAssessmentModuleName,
    );
    assert.isUndefined(syncedAssessmentModule);
  });

  it('records an error if an access rule end date is before the start date', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess?.push({
      startDate: '2020-01-01T11:11:11',
      endDate: '2019-01-01T00:00:00',
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Invalid allowAccess rule: startDate \(2020-01-01T11:11:11\) must not be after endDate \(2019-01-01T00:00:00\)/,
    );
  });

  it('records an error if an access rule start date is invalid', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess?.push({
      startDate: 'not a valid date',
      endDate: '2019-01-01T00:00:00',
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Invalid allowAccess rule: startDate \(not a valid date\) is not valid/,
    );
  });

  it('records an error if an access rule end date is invalid', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess?.push({
      startDate: '2020-01-01T11:11:11',
      endDate: 'not a valid date',
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Invalid allowAccess rule: endDate \(not a valid date\) is not valid/,
    );
  });

  it('records an error if an access rule sets active to false and has nonzero credit', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess?.push({
      credit: 100,
      active: false,
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Invalid allowAccess rule: credit must be 0 if active is false/,
    );
  });

  it('records an error if an access rule specifies an examUuid and mode=Public', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess?.push({
      mode: 'Public',
      examUuid: 'f593a8c9-ccd4-449c-936c-c26c96ea089b',
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_warnings,
      /Invalid allowAccess rule: examUuid cannot be used with "mode": "Public"/,
    );
  });

  it('records an error if a question specifies neither an ID nor an alternative', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones?.push({
      title: 'test zone',
      questions: [{}],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Zone question must specify either "alternatives" or "id"/,
    );
  });

  it('records an error if a question specifies maxPoints on an Exam-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          maxPoints: 5,
          points: 5,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Cannot specify "maxPoints" or "maxAutoPoints" for a question in an "Exam" assessment/,
    );
  });

  it('records an error if a question does not specify points on an Exam-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Must specify "points", "autoPoints" or "manualPoints" for a question/,
    );
  });

  it('records an error if a question does not specify points on a Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Must specify "points", "autoPoints" or "manualPoints" for a question/,
    );
  });

  it('records an error if a question specifies points and autoPoints', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
          autoPoints: 5,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Cannot specify "points" for a question if "autoPoints", "manualPoints" or "maxAutoPoints" are specified/,
    );
  });

  it('records an error if a question specifies points and manualPoints', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
          manualPoints: 5,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Cannot specify "points" for a question if "autoPoints", "manualPoints" or "maxAutoPoints" are specified/,
    );
  });

  it('records an error if a question specifies maxPoints and autoPoints', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          maxPoints: 15,
          autoPoints: 5,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Cannot specify "maxPoints" for a question if "autoPoints", "manualPoints" or "maxAutoPoints" are specified/,
    );
  });

  it('records an error if a question specifies points as an array on a Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          maxPoints: 10,
          points: [1, 2, 3],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Cannot specify "points" or "autoPoints" as a list for a question in a "Homework" assessment/,
    );
  });

  it('records a warning if a question has zero points and non-zero maxPoints on a Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          maxPoints: 10,
          points: 0,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(syncedAssessment?.sync_errors, /Cannot specify "points": 0 when "maxPoints" > 0/);
  });

  it('records a warning if a question has zero autoPoints and non-zero maxAutoPoints on a Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          maxAutoPoints: 10,
          autoPoints: 0,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Cannot specify "autoPoints": 0 when "maxAutoPoints" > 0/,
    );
  });

  it('records an error if an assessment directory is missing an infoAssessment.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'courseInstances', 'Fa19', 'assessments', 'fail'));
    await util.syncCourseData(courseDir);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.isOk(syncedAssessment);
    assert.match(
      syncedAssessment?.sync_errors,
      /Missing JSON file: courseInstances\/Fa19\/assessments\/fail\/infoAssessment.json/,
    );
  });

  it('records an error if a zone references an invalid QID', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: 'i do not exist ',
          points: [1, 2, 3],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /The following questions do not exist in this course: "i do not exist "/,
    );
  });

  describe('Test validating shared questions on sync', () => {
    it('records an error if a zone references a QID from another course that does not exist or we do not have permissions for', async () => {
      const courseData = util.getCourseData();
      const assessment = makeAssessment(courseData);
      assessment.zones?.push({
        title: 'test zone',
        questions: [
          {
            id: '@example-course/i do not exist',
            points: [1, 2, 3],
          },
        ],
      });
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;

      await withConfig({ checkSharingOnSync: true }, async () => {
        await util.writeAndSyncCourseData(courseData);
      });

      const syncedAssessment = await findSyncedAssessment('fail');
      assert.match(
        syncedAssessment?.sync_errors,
        /For each of the following, either the course you are referencing does not exist, or the question does not exist within that course: @example-course\/i do not exist/,
      );
    });
  });

  it('records an error if an assessment references a QID more than once', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones?.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
        },
        {
          id: util.QUESTION_ID,
          points: 5,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /The following questions are used more than once: "test"/,
    );
  });

  it('records an error if real-time grading is disallowed on a homework assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.allowRealTimeGrading = false;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Real-time grading cannot be disabled for Homework-type assessments/,
    );
  });

  it('records an error if multiple-element points array is specified for a question when real-time grading is disallowed', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowRealTimeGrading = false;
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            id: util.QUESTION_ID,
            points: [5, 4, 3],
          },
          {
            id: util.ALTERNATIVE_QUESTION_ID,
            points: [10, 9, 8],
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Cannot specify an array of multiple point values for a question/,
    );
  });

  it('accepts a single-element points array being specified for a question when real-time grading is disallowed', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowRealTimeGrading = false;
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            id: util.QUESTION_ID,
            points: [5],
          },
          {
            id: util.ALTERNATIVE_QUESTION_ID,
            points: [10],
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['points_array_size_one'] =
      assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('points_array_size_one');

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.ok(firstAssessmentQuestion);
    assert.deepEqual(firstAssessmentQuestion.points_list, [5]);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.ok(secondAssessmentQuestion);
    assert.deepEqual(secondAssessmentQuestion.points_list, [10]);

    const syncedAssessment = await findSyncedAssessment('points_array_size_one');
    assert.equal(syncedAssessment?.sync_errors, null);
  });

  it('records an error if multiple-element points array is specified for an alternative when real-time grading is disallowed', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowRealTimeGrading = false;
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            points: [10, 9, 8],
            alternatives: [
              {
                id: util.QUESTION_ID,
              },
              {
                id: util.ALTERNATIVE_QUESTION_ID,
                points: [5, 4, 3],
              },
            ],
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment?.sync_errors,
      /Cannot specify an array of multiple point values for an alternative/,
    );
  });

  it('records an error if an increasing points array is specified for an alternative', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            points: [10, 10, 9, 10],
            id: util.QUESTION_ID,
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(syncedAssessment?.sync_errors, /Points for a question must be non-increasing/);
  });

  it('accepts a single-element points array being specified for an alternative when real-time grading is disallowed', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowRealTimeGrading = false;
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            points: [10],
            alternatives: [
              {
                id: util.QUESTION_ID,
              },
              {
                id: util.ALTERNATIVE_QUESTION_ID,
                points: [5],
              },
            ],
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['points_array_size_one'] =
      assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('points_array_size_one');

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.ok(firstAssessmentQuestion);
    assert.deepEqual(firstAssessmentQuestion.points_list, [10]);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.ok(secondAssessmentQuestion);
    assert.deepEqual(secondAssessmentQuestion.points_list, [5]);

    const syncedAssessment = await findSyncedAssessment('points_array_size_one');
    assert.equal(syncedAssessment?.sync_errors, null);
  });

  it('records a warning if the same UUID is used multiple times in one course instance', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail1'] = assessment;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail2'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment1 = await findSyncedAssessment('fail1');
    assert.match(
      syncedAssessment1?.sync_warnings,
      /UUID ".*" is used in other assessments in this course instance: fail2/,
    );
    const syncedAssessment2 = await findSyncedAssessment('fail2');
    assert.match(
      syncedAssessment2?.sync_warnings,
      /UUID ".*" is used in other assessments in this course instance: fail1/,
    );
  });

  it('creates entry in the database in the case of invalid JSON', async () => {
    const courseData = util.getCourseData();
    // @ts-expect-error -- Deliberately invalid.
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = 'lol not valid json';
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const unknownAssessmentSet = syncedAssessmentSets.find((as) => as.name === 'Unknown');
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.isOk(syncedAssessment);
    assert.equal(syncedAssessment?.assessment_set_id, unknownAssessmentSet?.id);
    assert.equal(syncedAssessment?.number, '0');
  });

  it('creates entry in database in the case of a missing UUID', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    // @ts-expect-error -- Breaking assessment by removing UUID.
    delete assessment.uuid;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['missinguuid'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const unknownAssessmentSet = syncedAssessmentSets.find((as) => as.name === 'Unknown');
    const syncedAssessment = await findSyncedAssessment('missinguuid');
    assert.isOk(syncedAssessment);
    assert.equal(syncedAssessment?.assessment_set_id, unknownAssessmentSet?.id);
    assert.equal(syncedAssessment?.number, '0');
  });

  it('updates old invalid data once a UUID is added', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    const oldUuid = assessment.uuid;
    // @ts-expect-error -- Breaking assessment by removing UUID.
    delete assessment.uuid;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['missinguuid'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    assessment.uuid = oldUuid;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessment = await findSyncedAssessment('missinguuid');
    assert.equal(syncedAssessment?.title, assessment.title);
    assert.equal(syncedAssessment?.uuid, oldUuid);
  });

  it('maintains identity via UUID when assessment is renamed', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['originalname'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    const originalSyncedAssessment = await findSyncedAssessment('originalname');
    delete courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['originalname'];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newname'] = assessment;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedAssessment = await findSyncedAssessment('newname');
    assert.equal(newSyncedAssessment?.id, originalSyncedAssessment?.id);
  });

  it('soft-deletes unused assessments', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['unused'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    delete courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['unused'];
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessment = await findSyncedAssessment('unused');
    assert.isNotNull(syncedAssessment?.deleted_at);
  });

  it('preserves assessment despite deletion of the assessment set', async () => {
    const courseData = util.getCourseData();
    const assessmentSet = makeAssessmentSet();
    courseData.course.assessmentSets.push(assessmentSet);
    const assessment = makeAssessment(courseData);
    assessment.set = assessmentSet.name;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['testAssessment'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    const originalSyncedAssessment = await findSyncedAssessment('testAssessment');

    // now delete the assessment set, but leave the assessment in place
    courseData.course.assessmentSets.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedAssessment = await findSyncedAssessment('testAssessment');
    assert.equal(newSyncedAssessment?.id, originalSyncedAssessment?.id);

    // check we have a valid auto-created assessment set
    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const syncedAssessmentSet = syncedAssessmentSets.find((as) => as.name === assessmentSet.name);
    assert.equal(newSyncedAssessment?.assessment_set_id, syncedAssessmentSet?.id);
  });

  it('correctly handles a new assessment with the same TID as a deleted assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['testAssessment'] = assessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the assessment and re-sync
    assessment.uuid = '98c427af-1216-47ad-b982-6e88974080e1';
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessment = await findSyncedUndeletedAssessment('testAssessment');
    assert.equal(syncedAssessment?.uuid, assessment.uuid);
  });

  it('does not add errors to deleted assessments', async () => {
    const courseData = util.getCourseData();
    const originalAssessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['repeatedAssessment'] =
      originalAssessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the assessment, add an error and re-sync
    const newAssessment = { ...originalAssessment };
    newAssessment.uuid = '49c8b795-dfde-4c13-a040-0fd1ba711dc5';
    // @ts-expect-error -- Breaking assessment by removing title.
    delete newAssessment.title;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['repeatedAssessment'] =
      newAssessment;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // check that the newly-synced assessment has an error
    const syncedAssessments = await util.dumpTable('assessments');
    const syncedAssessment = syncedAssessments.find(
      (a) => a.tid === 'repeatedAssessment' && a.deleted_at == null,
    );
    assert.equal(syncedAssessment?.uuid, newAssessment.uuid);
    assert.match(syncedAssessment?.sync_errors, /must have required property 'title'/);

    // check that the old deleted assessment does not have any errors
    const deletedAssessment = syncedAssessments.find(
      (a) => a.tid === 'repeatedAssessment' && a.deleted_at != null,
    );
    assert.equal(deletedAssessment?.uuid, originalAssessment.uuid);
    assert.equal(deletedAssessment?.sync_errors, null);
  });

  it('records an error if a nested assessment directory does not eventually contain an infoAssessment.json file', async () => {
    const courseData = util.getCourseData();
    const nestedAssessmentStructure = [
      'subfolder1',
      'subfolder2',
      'subfolder3',
      'nestedAssessment',
    ];
    const assessmentId = nestedAssessmentStructure.join('/');
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(
      path.join(
        courseDir,
        'courseInstances',
        util.COURSE_INSTANCE_ID,
        'assessments',
        ...nestedAssessmentStructure,
      ),
    );
    await util.syncCourseData(courseDir);

    const syncedAssessment = await findSyncedAssessment(assessmentId);
    assert.isOk(syncedAssessment);
    assert.match(
      syncedAssessment?.sync_errors,
      new RegExp(
        `Missing JSON file: courseInstances/${util.COURSE_INSTANCE_ID}/assessments/subfolder1/subfolder2/subfolder3/nestedAssessment/infoAssessment.json`,
      ),
    );

    // We should only record an error for the most deeply nested directories,
    // not any of the intermediate ones.
    for (let i = 0; i < nestedAssessmentStructure.length - 1; i++) {
      const partialNestedAssessmentStructure = nestedAssessmentStructure.slice(0, i);
      const partialAssessmentId = partialNestedAssessmentStructure.join('/');

      const syncedAssessment = await findSyncedAssessment(partialAssessmentId);
      assert.isUndefined(syncedAssessment);
    }
  });

  it('records an error if multipleInstance is true for Homework-type assessments', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.type = 'Homework';
    assessment.multipleInstance = true;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.equal(
      syncedAssessment?.sync_errors,
      '"multipleInstance" cannot be used for Homework-type assessments',
    );
  });

  // https://github.com/PrairieLearn/PrairieLearn/issues/6539
  it('handles unique sequence of renames and duplicate UUIDs', async () => {
    const courseData = util.getCourseData();

    // Start with a clean slate.
    const courseInstanceData = courseData.courseInstances[util.COURSE_INSTANCE_ID];
    courseInstanceData.assessments = {};

    // Write and sync a single assessment.
    const originalAssessment = makeAssessment(courseData);
    originalAssessment.uuid = '0e8097aa-b554-4908-9eac-d46a78d6c249';
    courseInstanceData.assessments['a'] = originalAssessment;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // Now "move" the above assessment to a new directory AND add another with the
    // same UUID.
    delete courseInstanceData.assessments['a'];
    courseInstanceData.assessments['b'] = originalAssessment;
    courseInstanceData.assessments['c'] = originalAssessment;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // Now "fix" the duplicate UUID.
    courseInstanceData.assessments['c'] = {
      ...originalAssessment,
      uuid: '0e3097ba-b554-4908-9eac-d46a78d6c249',
    };
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const assessments = await util.dumpTable('assessments');

    // Original assessment should not exist.
    const originalAssessmentRow = assessments.find((a) => a.tid === 'a');
    assert.isUndefined(originalAssessmentRow);

    // New assessments should exist and have the correct UUIDs.
    const newAssessmentRow1 = assessments.find((a) => a.tid === 'b' && a.deleted_at === null);
    assert.isNull(newAssessmentRow1?.deleted_at);
    assert.equal(newAssessmentRow1?.uuid, '0e8097aa-b554-4908-9eac-d46a78d6c249');
    const newAssessmentRow2 = assessments.find((a) => a.tid === 'c' && a.deleted_at === null);
    assert.isNull(newAssessmentRow2?.deleted_at);
    assert.equal(newAssessmentRow2?.uuid, '0e3097ba-b554-4908-9eac-d46a78d6c249');
  });

  it('forbids draft questions on assessments', async () => {
    const courseData = util.getCourseData();

    // "Rename" the default question such that it is a draft.
    courseData.questions['__drafts__/draft_1'] = courseData.questions[util.QUESTION_ID];
    delete courseData.questions[util.QUESTION_ID];

    const assessment = makeAssessment(courseData);
    assessment.zones?.push({
      title: 'test zone',
      questions: [{ id: '__drafts__/draft_1', points: 5 }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;

    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('fail');
    assert.isOk(syncedData.assessment.sync_errors);
    assert.match(
      syncedData.assessment?.sync_errors,
      /The following questions are marked as draft and therefore cannot be used in assessments: "__drafts__\/draft_1"/,
    );
  });

  describe('exam UUID validation', () => {
    let originalCheckAccessRulesExamUuid: boolean;
    beforeAll(() => {
      originalCheckAccessRulesExamUuid = config.checkAccessRulesExamUuid;
      config.checkAccessRulesExamUuid = true;
    });
    afterAll(() => {
      config.checkAccessRulesExamUuid = originalCheckAccessRulesExamUuid;
    });

    it('validates exam UUIDs for assessments in an accessible course instances', async () => {
      const courseData = util.getCourseData();

      // Ensure the course instance is accessible.
      const courseInstanceData = courseData.courseInstances[util.COURSE_INSTANCE_ID];
      const courseInstance = courseInstanceData.courseInstance;
      if (!courseInstance) throw new Error('missing courseInstance');
      courseInstance.allowAccess = [
        {
          startDate: '2000-01-01T00:00:00',
          endDate: '3000-01-01T00:00:00',
        },
      ];

      // This assessment has both valid and invalid exam UUIDs.
      const assessment = makeAssessment(courseData);
      assessment.allowAccess = [
        {
          mode: 'Exam',
          examUuid: '00000000-0000-0000-0000-000000000000',
        },
        {
          mode: 'Exam',
          examUuid: '11111111-1111-1111-1111-111111111111',
        },
      ];
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;

      // Insert a `pt_exams` row for the valid exam UUID.
      await sqldb.queryAsync(sql.insert_pt_exam, { uuid: '11111111-1111-1111-1111-111111111111' });

      await util.writeAndSyncCourseData(courseData);
      const syncedAssessment = await findSyncedAssessment('fail');
      assert.match(
        syncedAssessment?.sync_warnings,
        /examUuid "00000000-0000-0000-0000-000000000000" not found./,
      );
      assert.notMatch(syncedAssessment?.sync_warnings, /11111111-1111-1111-1111-111111111111/);
    });

    it('does not validate exam UUIDs for assessments in an inaccessible course instance', async () => {
      const courseData = util.getCourseData();

      // Ensure the course instance is not accessible.
      const courseInstanceData = courseData.courseInstances[util.COURSE_INSTANCE_ID];
      const courseInstance = courseInstanceData.courseInstance;
      if (!courseInstance) throw new Error('missing courseInstance');
      courseInstance.allowAccess = [
        {
          startDate: '1000-01-01T00:00:00',
          endDate: '2000-01-01T00:00:00',
        },
      ];

      // Create an assessment with an invalid exam UUID.
      const assessment = makeAssessment(courseData);
      assessment.type = 'Exam';
      assessment.allowAccess = [
        {
          mode: 'Exam',
          examUuid: '00000000-0000-0000-0000-000000000000',
        },
      ];
      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;

      await util.writeAndSyncCourseData(courseData);
      const syncedAssessment = await findSyncedAssessment('fail');
      assert.isNotOk(syncedAssessment?.sync_warnings);
    });
  });
  it('syncs JSON data for grade rate minutes correctly', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.gradeRateMinutes = 1;
    assessment.zones?.push({
      title: 'zone 1',
      gradeRateMinutes: 2,
      questions: [
        {
          id: util.QUESTION_ID,
          points: 1,
          gradeRateMinutes: 3,
        },
        {
          points: 1,
          gradeRateMinutes: 4,
          alternatives: [
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              gradeRateMinutes: 5,
            },
            {
              id: util.MANUAL_GRADING_QUESTION_ID,
            },
          ],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newhomework'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('newhomework');
    assert.equal(syncedData.assessment.json_grade_rate_minutes, 1);
    assert.equal(syncedData.zones[0].json_grade_rate_minutes, 2);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.equal(firstAssessmentQuestion?.grade_rate_minutes, 3);
    assert.equal(firstAssessmentQuestion?.json_grade_rate_minutes, 3);

    const alternativeGroup = syncedData.alternative_groups.find((ag) => ag.number === 2);
    assert.equal(alternativeGroup?.json_grade_rate_minutes, 4);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.equal(secondAssessmentQuestion?.grade_rate_minutes, 5);
    assert.equal(secondAssessmentQuestion?.json_grade_rate_minutes, 5);

    const thirdAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.MANUAL_GRADING_QUESTION_ID,
    );
    assert.equal(thirdAssessmentQuestion?.grade_rate_minutes, 4);
    assert.equal(thirdAssessmentQuestion?.json_grade_rate_minutes, null);
  });

  it('syncs JSON data for group role permissions correctly', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.groupWork = true;
    assessment.groupRoles = [
      {
        name: 'Manager',
        minimum: 1,
        maximum: 1,
        canAssignRoles: true,
      },
      {
        name: 'Recorder',
        minimum: 1,
        maximum: 1,
      },
      {
        name: 'Reflector',
        minimum: 1,
        maximum: 1,
      },
      {
        name: 'Contributor',
      },
    ];
    assessment.canView = ['Manager'];
    assessment.canSubmit = ['Recorder'];
    assessment.zones?.push({
      title: 'zone 1',
      canView: ['Manager', 'Recorder', 'Contributor'],
      canSubmit: ['Recorder', 'Contributor'],
      questions: [
        {
          id: util.QUESTION_ID,
          points: 1,
          canView: ['Contributor'],
          canSubmit: ['Contributor'],
        },
        {
          points: 1,
          canView: ['Manager'],
          canSubmit: ['Recorder'],
          alternatives: [
            {
              id: util.ALTERNATIVE_QUESTION_ID,
            },
            {
              id: util.MANUAL_GRADING_QUESTION_ID,
            },
          ],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newhomework'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('newhomework');
    assert.deepEqual(syncedData.assessment.json_can_view, ['Manager']);
    assert.deepEqual(syncedData.assessment.json_can_submit, ['Recorder']);
    assert.deepEqual(syncedData.zones[0].json_can_view, ['Manager', 'Recorder', 'Contributor']);
    assert.deepEqual(syncedData.zones[0].json_can_submit, ['Recorder', 'Contributor']);
    assert.deepEqual(syncedData.alternative_groups[0].json_can_view, ['Contributor']);
    assert.deepEqual(syncedData.alternative_groups[0].json_can_submit, ['Contributor']);
    assert.equal(syncedData.alternative_groups[0].json_has_alternatives, false);
    assert.equal(syncedData.alternative_groups[1].json_has_alternatives, true);
  });

  it('syncs advanceScorePerc correctly', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.advanceScorePerc = 50;
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            id: util.QUESTION_ID,
            points: 1,
          },
        ],
      },
      {
        title: 'zone 2',
        advanceScorePerc: 60,
        questions: [
          {
            id: util.ALTERNATIVE_QUESTION_ID,
            points: 1,
            advanceScorePerc: 70,
          },
          {
            advanceScorePerc: 80,
            alternatives: [
              {
                id: util.MANUAL_GRADING_QUESTION_ID,
                points: 1,
              },
              {
                id: util.WORKSPACE_QUESTION_ID,
                points: 1,
                advanceScorePerc: 90,
              },
            ],
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newhomework'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('newhomework');
    assert.equal(syncedData.assessment.advance_score_perc, 50);
    assert.equal(syncedData.zones[0].advance_score_perc, null);
    assert.equal(syncedData.assessment_questions[0].advance_score_perc, null);
    assert.equal(syncedData.assessment_questions[0].effective_advance_score_perc, 50);
    assert.equal(syncedData.zones[1].advance_score_perc, 60);
    assert.equal(syncedData.assessment_questions[1].advance_score_perc, 70);
    assert.equal(syncedData.assessment_questions[1].effective_advance_score_perc, 70);
    assert.equal(syncedData.alternative_groups[2].advance_score_perc, 80);
    assert.equal(syncedData.assessment_questions[2].advance_score_perc, null);
    assert.equal(syncedData.assessment_questions[2].effective_advance_score_perc, 80);
    assert.equal(syncedData.assessment_questions[3].advance_score_perc, 90);
    assert.equal(syncedData.assessment_questions[3].effective_advance_score_perc, 90);
  });

  it('syncs string comments correctly', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.comment = 'assessment comment';
    assessment.allowAccess = [
      {
        comment: 'access rule',
      },
    ];
    assessment.zones?.push({
      title: 'zone 1',
      comment: 'zone comment',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 1,
          comment: 'question comment',
        },
        {
          points: 1,
          comment: 'alternative group comment',
          alternatives: [
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              comment: 'alternative question comment',
            },
            {
              id: util.MANUAL_GRADING_QUESTION_ID,
            },
          ],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['testHomework'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('testHomework');
    assert.equal(syncedData.assessment.json_comment, 'assessment comment');

    const syncedAssessmentAccessRules = await util.dumpTable('assessment_access_rules');
    const rulesForAssessmentWithString = syncedAssessmentAccessRules.filter((aar) =>
      idsEqual(aar.assessment_id, syncedData.assessment.id),
    );
    assert.lengthOf(rulesForAssessmentWithString, 1);
    assert.equal(rulesForAssessmentWithString[0].json_comment, 'access rule');

    assert.equal(syncedData.zones[0].json_comment, 'zone comment');

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.equal(firstAssessmentQuestion?.json_comment, 'question comment');
    assert.equal(syncedData.alternative_groups[1].json_comment, 'alternative group comment');
    const alternativeQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.equal(alternativeQuestion?.json_comment, 'alternative question comment');
  });

  it('syncs array comments correctly', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.comment = ['assessment comment 1', 'assessment comment 2'];
    assessment.allowAccess = [
      {
        comment: ['access rule comment 1', 'access rule comment 2'],
      },
    ];
    assessment.zones?.push({
      title: 'zone 1',
      comment: ['zone comment 1', 'zone comment 2'],
      questions: [
        {
          id: util.QUESTION_ID,
          points: 1,
          comment: ['question comment 1', 'question comment 2'],
        },
        {
          points: 1,
          comment: ['alternative group comment 1', 'alternative group comment 2'],
          alternatives: [
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              comment: ['alternative question comment 1', 'alternative question comment 2'],
            },
            {
              id: util.MANUAL_GRADING_QUESTION_ID,
            },
          ],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['testHomework'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('testHomework');
    assert.deepEqual(syncedData.assessment.json_comment, [
      'assessment comment 1',
      'assessment comment 2',
    ]);

    const syncedAssessmentAccessRules = await util.dumpTable('assessment_access_rules');
    const rulesForAssessmentWithString = syncedAssessmentAccessRules.filter((aar) =>
      idsEqual(aar.assessment_id, syncedData.assessment.id),
    );
    assert.lengthOf(rulesForAssessmentWithString, 1);
    assert.deepEqual(rulesForAssessmentWithString[0].json_comment, [
      'access rule comment 1',
      'access rule comment 2',
    ]);

    assert.deepEqual(syncedData.zones[0].json_comment, ['zone comment 1', 'zone comment 2']);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.deepEqual(firstAssessmentQuestion?.json_comment, [
      'question comment 1',
      'question comment 2',
    ]);
    assert.deepEqual(syncedData.alternative_groups[1].json_comment, [
      'alternative group comment 1',
      'alternative group comment 2',
    ]);
    const alternativeQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.deepEqual(alternativeQuestion?.json_comment, [
      'alternative question comment 1',
      'alternative question comment 2',
    ]);
  });

  it('syncs object comments correctly', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.comment = {
      comment: 'assessment comment',
      comment2: 'assessment comment 2',
    };
    assessment.allowAccess = [
      {
        comment: {
          comment: 'access rule comment',
          comment2: 'access rule comment 2',
        },
      },
    ];
    assessment.zones?.push({
      title: 'zone 1',
      comment: {
        comment: 'zone comment',
        comment2: 'zone comment 2',
      },
      questions: [
        {
          id: util.QUESTION_ID,
          points: 1,
          comment: {
            comment: 'question comment',
            comment2: 'question comment 2',
          },
        },
        {
          points: 1,
          comment: {
            comment: 'alternative group comment',
            comment2: 'alternative group comment 2',
          },
          alternatives: [
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              comment: {
                comment: 'alternative question comment',
                comment2: 'alternative question comment 2',
              },
            },
            {
              id: util.MANUAL_GRADING_QUESTION_ID,
            },
          ],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['testHomework'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('testHomework');
    assert.deepEqual(syncedData.assessment.json_comment, {
      comment: 'assessment comment',
      comment2: 'assessment comment 2',
    });

    const syncedAssessmentAccessRules = await util.dumpTable('assessment_access_rules');
    const rulesForAssessmentWithString = syncedAssessmentAccessRules.filter((aar) =>
      idsEqual(aar.assessment_id, syncedData.assessment.id),
    );
    assert.lengthOf(rulesForAssessmentWithString, 1);
    assert.deepEqual(rulesForAssessmentWithString[0].json_comment, {
      comment: 'access rule comment',
      comment2: 'access rule comment 2',
    });

    assert.deepEqual(syncedData.zones[0].json_comment, {
      comment: 'zone comment',
      comment2: 'zone comment 2',
    });

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID,
    );
    assert.deepEqual(firstAssessmentQuestion?.json_comment, {
      comment: 'question comment',
      comment2: 'question comment 2',
    });
    assert.deepEqual(syncedData.alternative_groups[1].json_comment, {
      comment: 'alternative group comment',
      comment2: 'alternative group comment 2',
    });
    const alternativeQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID,
    );
    assert.deepEqual(alternativeQuestion?.json_comment, {
      comment: 'alternative question comment',
      comment2: 'alternative question comment 2',
    });
  });

  it('records a warning for UIDs containing commas or spaces', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess = [
      {
        startDate: '2024-01-01T00:00:00',
        endDate: '3024-01-31T00:00:00',
        uids: ['foo@example.com,bar@example.com', 'biz@example.com baz@example.com'],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['testAssessment'] = assessment;
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedAssessments = await util.dumpTable('assessments');
    const syncedAssessment = syncedAssessments.find((a) => a.tid === 'testAssessment');
    assert.isOk(syncedAssessment);
    assert.match(
      syncedAssessment?.sync_warnings,
      /The following access rule UIDs contain unexpected whitespace: "biz@example.com baz@example.com"/,
    );
    assert.match(
      syncedAssessment?.sync_warnings,
      /The following access rule UIDs contain unexpected commas: "foo@example.com,bar@example.com"/,
    );
  });

  it('forbids sharing settings when sharing is not enabled', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[
      util.ASSESSMENT_ID
    ].shareSourcePublicly = true;

    await withConfig({ checkSharingOnSync: true }, async () => {
      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);
    });

    const syncedAssessments = await util.dumpTable('assessments');
    const syncedAssessment = syncedAssessments.find((a) => a.tid === util.ASSESSMENT_ID);
    assert.isOk(syncedAssessment);
    assert.match(syncedAssessment?.sync_errors, /"shareSourcePublicly" cannot be used/);
  });
});
