import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { fillInstanceQuestionColumnEntries } from '../ee/lib/ai-grading/ai-grading-stats.js';
import { deleteAiGradingJobs } from '../ee/lib/ai-grading/ai-grading-util.js';
import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import {
  type Assessment,
  type AssessmentQuestion,
  AssessmentQuestionSchema,
  GradingJobSchema,
} from '../lib/db-types.js';
import { updateInstanceQuestionScore } from '../lib/manualGrading.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { generateAndEnrollUsers, selectOptionalEnrollmentByUserId } from '../models/enrollment.js';
import {
  addLabelToEnrollment,
  selectStudentLabelsInCourseInstance,
} from '../models/student-label.js';
import { selectSubmissionById } from '../models/submission.js';
import { InstanceQuestionRowWithAIGradingStatsSchema } from '../pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestion.types.js';
import { selectInstanceQuestionsForManualGrading } from '../pages/instructorAssessmentManualGrading/assessmentQuestion/queries.js';
import { getManualGradingJsonData } from '../pages/instructorAssessmentManualGrading/assessmentQuestion/utils/exportData.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const conflictSql = sqldb.loadSqlEquiv(
  new URL(
    '../pages/instructorAssessmentManualGrading/instanceQuestion/instanceQuestion.ts',
    import.meta.url,
  ).href,
);

async function selectExportRow(
  assessment: Assessment,
  assessment_question: AssessmentQuestion,
  id: string,
) {
  const rows = await fillInstanceQuestionColumnEntries(
    await selectInstanceQuestionsForManualGrading({ assessment, assessment_question }),
    assessment_question,
  );
  return InstanceQuestionRowWithAIGradingStatsSchema.parse(
    rows.find((row) => row.instance_question.id === id),
  );
}

async function selectAssessmentQuestion(assessment_id: string, qid: string) {
  return await sqldb.queryRow(
    sql.select_assessment_question_by_qid,
    { assessment_id, qid },
    AssessmentQuestionSchema,
  );
}

async function insertIndividualInstanceQuestion({
  assessment_id,
  assessment_question_id,
  user_id,
  assigned_grader,
  last_grader,
}: {
  assessment_id: string;
  assessment_question_id: string;
  user_id: string;
  assigned_grader: string | null;
  last_grader: string | null;
}) {
  const aiId = await sqldb.queryScalar(
    sql.insert_assessment_instance_for_user,
    { assessment_id, user_id },
    IdSchema,
  );
  return await sqldb.queryScalar(
    sql.insert_instance_question,
    {
      assessment_instance_id: aiId,
      assessment_question_id,
      assigned_grader,
      last_grader,
    },
    IdSchema,
  );
}

async function createGradingExportFixture() {
  const assessment = await selectAssessmentByTid({
    course_instance_id: '1',
    tid: 'hw9-internalExternalManual',
  });
  const aq = await selectAssessmentQuestion(assessment.id, 'manualGrade/codeUpload');
  const [student, grader] = await generateAndEnrollUsers({ count: 2, course_instance_id: '1' });
  const iqId = await insertIndividualInstanceQuestion({
    assessment_id: assessment.id,
    assessment_question_id: aq.id,
    user_id: student.id,
    assigned_grader: null,
    last_grader: null,
  });
  const submissionId = await sqldb.queryScalar(
    sql.insert_submission_for_instance_question,
    { instance_question_id: iqId },
    IdSchema,
  );
  return {
    assessment,
    aq,
    grader,
    iqId,
    submissionId,
    options: { assessment, studentLabels: [], instanceQuestionGroups: [], rubricData: null },
  };
}

describe('Manual grading exports', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  test('individual: returns full user and grader objects', async () => {
    const hw9 = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw9-internalExternalManual',
    });
    const aq = await selectAssessmentQuestion(hw9.id, 'manualGrade/codeUpload');

    const [student, grader] = await generateAndEnrollUsers({
      count: 2,
      course_instance_id: '1',
    });

    const iqId = await insertIndividualInstanceQuestion({
      assessment_id: hw9.id,
      assessment_question_id: aq.id,
      user_id: student.id,
      assigned_grader: grader.id,
      last_grader: grader.id,
    });

    const courseInstance = await selectCourseInstanceById(hw9.course_instance_id);
    const enrollment = await selectOptionalEnrollmentByUserId({
      userId: student.id,
      courseInstance,
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    assert.ok(enrollment);
    const labels = await selectStudentLabelsInCourseInstance(courseInstance);
    assert.lengthOf(labels, 2);
    for (const label of labels) {
      await addLabelToEnrollment({
        enrollment,
        label,
        authzData: dangerousFullSystemAuthz(),
      });
    }

    const rows = await selectInstanceQuestionsForManualGrading({
      assessment: hw9,
      assessment_question: aq,
    });

    const row = rows.find((r) => r.instance_question.id === iqId);
    assert.ok(row);
    assert.equal(row.user?.uid, student.uid);
    assert.equal(row.user?.name, student.name);
    assert.equal(row.user?.email, student.email);
    assert.deepEqual(row.group_members, []);
    assert.equal(row.assigned_grader?.uid, grader.uid);
    assert.equal(row.assigned_grader?.email, grader.email);
    assert.equal(row.last_grader?.uid, grader.uid);
    assert.deepEqual(
      row.student_label_ids,
      labels.map((label) => label.id).sort((a, b) => Number(a) - Number(b)),
    );
  });

  test('individual: returns null graders when none are set', async () => {
    const hw9 = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw9-internalExternalManual',
    });
    const aq = await selectAssessmentQuestion(hw9.id, 'manualGrade/codeUpload');

    const [student] = await generateAndEnrollUsers({ count: 1, course_instance_id: '1' });

    const iqId = await insertIndividualInstanceQuestion({
      assessment_id: hw9.id,
      assessment_question_id: aq.id,
      user_id: student.id,
      assigned_grader: null,
      last_grader: null,
    });

    const rows = await selectInstanceQuestionsForManualGrading({
      assessment: hw9,
      assessment_question: aq,
    });

    const row = rows.find((r) => r.instance_question.id === iqId);
    assert.ok(row);
    assert.equal(row.user?.uid, student.uid);
    assert.equal(row.assigned_grader, null);
    assert.equal(row.last_grader, null);
    assert.deepEqual(row.student_label_ids, []);
  });

  test('team: returns null user and a sorted group_members array', async () => {
    const hw5 = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw5-templateGroupWork',
    });
    const aq = await selectAssessmentQuestion(hw5.id, 'demo/demoNewton-page1');

    const members = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });

    const teamId = await sqldb.queryScalar(
      sql.insert_team,
      {
        assessment_id: hw5.id,
        course_instance_id: '1',
        name: `Test${Date.now()}`,
        member_user_ids: members.map((m) => m.id),
      },
      IdSchema,
    );

    const aiId = await sqldb.queryScalar(
      sql.insert_assessment_instance_for_team,
      { assessment_id: hw5.id, team_id: teamId },
      IdSchema,
    );
    const iqId = await sqldb.queryScalar(
      sql.insert_instance_question,
      {
        assessment_instance_id: aiId,
        assessment_question_id: aq.id,
        assigned_grader: null,
        last_grader: null,
      },
      IdSchema,
    );

    const rows = await selectInstanceQuestionsForManualGrading({
      assessment: hw5,
      assessment_question: aq,
    });

    const row = rows.find((r) => r.instance_question.id === iqId);
    assert.ok(row);
    assert.equal(row.user, null);
    assert.lengthOf(row.group_members, 3);
    const memberUids = row.group_members.map((m) => m.uid);
    const expectedUids = members.map((m) => m.uid).sort();
    assert.deepEqual(memberUids, expectedUids);
  });

  test('preserves manual scores and feedback across partial edits with separate provenance', async () => {
    const { assessment, aq, grader, iqId, submissionId, options } =
      await createGradingExportFixture();
    const [updater] = await generateAndEnrollUsers({ count: 1, course_instance_id: '1' });
    const grade = (
      score: Parameters<typeof updateInstanceQuestionScore>[0]['score'],
      is_ai_graded = false,
      authn_user_id = grader.id,
    ) =>
      updateInstanceQuestionScore({
        assessment,
        instance_question_id: iqId,
        submission_id: submissionId,
        check_modified_at: null,
        score,
        authn_user_id,
        is_ai_graded,
      });
    const humanScore = await grade({
      manual_points: 3,
      auto_points: 0,
      feedback: { manual: 'Original human feedback', extra: 'Retained human feedback' },
    });
    await grade({ manual_points: 2, feedback: { manual: 'AI feedback' } }, true);
    const feedbackUpdate = await grade({ feedback: { manual: 'Updated human feedback' } });
    const autoUpdate = await grade({ auto_points: 1 }, false, updater.id);
    const row = await selectExportRow(assessment, aq, iqId);
    const json = getManualGradingJsonData(row, options);
    assert.equal(json.manual_points, 2);
    assert.equal(json.human_grading?.manual_points, 3);
    assert.equal(json.human_grading?.grading_job_id, humanScore.grading_job_id);
    assert.equal(json.human_grading?.grader?.uid, grader.uid);
    assert.equal(row.instance_question.last_human_grader, updater.name ?? updater.uid);
    assert.equal(json.human_grading?.latest_update?.grading_job_id, autoUpdate.grading_job_id);
    assert.deepEqual(json.human_grading?.feedback, {
      manual: 'Updated human feedback',
      extra: 'Retained human feedback',
    });
    assert.equal(
      json.human_grading?.feedback_sources.manual?.grading_job_id,
      feedbackUpdate.grading_job_id,
    );
    assert.equal(
      json.human_grading?.feedback_sources.extra?.grading_job_id,
      humanScore.grading_job_id,
    );
    assert.equal(json.ai_grading_comparison.points_ai_minus_human, -1);
    await grade({ manual_points: 4 });
    const scoreEdit = getManualGradingJsonData(
      await selectExportRow(assessment, aq, iqId),
      options,
    );
    assert.equal(scoreEdit.human_grading?.manual_points, 4);
    assert.deepEqual(scoreEdit.human_grading?.feedback, json.human_grading?.feedback);
  });

  test('excludes inactive conflict attempts while retaining conflict details and AI-deletion recovery', async () => {
    const { assessment, aq, grader, iqId, submissionId, options } =
      await createGradingExportFixture();
    const grade = (
      manual_points: number,
      is_ai_graded = false,
      check_modified_at: Date | null = null,
    ) =>
      updateInstanceQuestionScore({
        assessment,
        instance_question_id: iqId,
        submission_id: submissionId,
        check_modified_at,
        score: { manual_points, feedback: { manual: `Score ${manual_points}` } },
        authn_user_id: grader.id,
        is_ai_graded,
      });
    await grade(2, true);
    const staleTimestamp = (await selectExportRow(assessment, aq, iqId)).instance_question
      .modified_at;
    const humanScore = await grade(3);
    const conflict = await grade(8, false, staleTimestamp);
    assert.isTrue(conflict.modified_at_conflict);
    const conflictJob = await sqldb.queryRow(
      conflictSql.select_grading_job_data,
      {
        instance_question_id: iqId,
        grading_job_id: conflict.grading_job_id,
      },
      GradingJobSchema,
    );
    assert.equal(conflictJob.manual_points, 8);
    const json = getManualGradingJsonData(await selectExportRow(assessment, aq, iqId), options);
    assert.equal(json.manual_points, 3);
    assert.equal(json.human_grading?.manual_points, 3);
    assert.equal(json.human_grading?.grading_job_id, humanScore.grading_job_id);
    assert.equal(json.ai_grading_comparison.points_ai_minus_human, -1);

    await deleteAiGradingJobs({ assessment_question_ids: [aq.id], authn_user_id: grader.id });
    const restored = getManualGradingJsonData(await selectExportRow(assessment, aq, iqId), options);
    assert.equal(restored.manual_points, 3);
    assert.deepEqual((await selectSubmissionById({ submission_id: submissionId })).feedback, {
      manual: 'Score 3',
    });
  });
});
