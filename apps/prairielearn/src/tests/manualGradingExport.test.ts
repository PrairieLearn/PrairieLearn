import { text } from 'node:stream/consumers';

import { parse } from 'csv-parse/sync';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { stringifyNonblocking } from '@prairielearn/csv';
import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { fillInstanceQuestionColumnEntries } from '../ee/lib/ai-grading/ai-grading-stats.js';
import { deleteAiGradingJobs } from '../ee/lib/ai-grading/ai-grading-util.js';
import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import {
  StaffInstanceQuestionGroupSchema,
  StaffStudentLabelSchema,
} from '../lib/client/safe-db-types.js';
import {
  type Assessment,
  type AssessmentQuestion,
  AssessmentQuestionSchema,
  GradingJobSchema,
  RubricItemSchema,
} from '../lib/db-types.js';
import { selectRubricData, updateInstanceQuestionScore } from '../lib/manualGrading.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { generateAndEnrollUsers, selectOptionalEnrollmentByUserId } from '../models/enrollment.js';
import {
  addLabelToEnrollment,
  selectStudentLabelsInCourseInstance,
} from '../models/student-label.js';
import { InstanceQuestionRowWithAIGradingStatsSchema } from '../pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestion.types.js';
import { selectInstanceQuestionsForManualGrading } from '../pages/instructorAssessmentManualGrading/assessmentQuestion/queries.js';
import {
  getManualGradingCsvData,
  getManualGradingJsonData,
} from '../pages/instructorAssessmentManualGrading/assessmentQuestion/utils/exportData.js';

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

async function csvToRecord(
  cells: ReturnType<typeof getManualGradingCsvData>,
): Promise<Record<string, string>> {
  const csv = await text(
    stringifyNonblocking(
      [cells.map(({ value }) => (Array.isArray(value) ? value.join('; ') : value))],
      { header: true, columns: cells.map(({ name }) => name) },
    ),
  );
  return parse<Record<string, string>>(csv, { columns: true })[0];
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
  const variantId = await sqldb.queryScalar(
    sql.insert_variant,
    { instance_question_id: iqId },
    IdSchema,
  );
  const submissionId = await sqldb.queryScalar(
    sql.insert_submission,
    {
      variant_id: variantId,
      date: '2020-01-02T00:00:00Z',
      manual_rubric_grading_id: null,
    },
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

    await sqldb.execute(sql.insert_issue, { assessment_id: hw9.id, instance_question_id: iqId });
    const exportRow = await selectExportRow(hw9, aq, iqId);
    const options = {
      assessment: hw9,
      studentLabels: labels.map((label) => StaffStudentLabelSchema.parse(label)),
      instanceQuestionGroups: [],
      rubricData: null,
    };
    const json = getManualGradingJsonData(exportRow, options);
    assert.deepEqual(
      'student_labels' in json ? json.student_labels : null,
      labels.map(({ id, name }) => ({ id, name })),
    );
    assert.isTrue(json.assessment_open);
    assert.equal(json.open_issue_count, 1);
    assert.equal(json.max_manual_points, aq.max_manual_points);
    const csv = await csvToRecord(getManualGradingCsvData(exportRow, options));
    assert.equal(csv.Labels, labels.map(({ name }) => name).join('; '));
    assert.equal(csv['Assessment Open'], 'true');
    assert.equal(csv['Open Issue Count'], '1');
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

    const exportRow = await selectExportRow(hw9, aq, iqId);
    const options = {
      assessment: hw9,
      studentLabels: [],
      instanceQuestionGroups: [],
      rubricData: null,
    };
    const json = getManualGradingJsonData(exportRow, options);
    assert.isNull(json.human_grading);
    assert.isNull(json.ai_grading);
    assert.deepEqual(json.ai_grading_comparison, {
      points_ai_minus_human: null,
      rubric_difference: null,
      rubric_similarity: null,
    });
    const csv = await csvToRecord(getManualGradingCsvData(exportRow, options));
    assert.equal(csv['Human Grading'], '');
    assert.equal(csv['AI Grading'], '');
    assert.equal(csv['Point Difference (AI - Human)'], '');
    assert.equal(csv['Rubric Difference'], '');
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

    const exportRow = await selectExportRow(hw5, aq, iqId);
    const options = {
      assessment: hw5,
      studentLabels: [],
      instanceQuestionGroups: [],
      rubricData: null,
    };
    const json = getManualGradingJsonData(exportRow, options);
    assert.deepEqual(
      'group' in json ? json.group.members.map((member) => member?.uid) : null,
      expectedUids,
    );
    assert.notProperty(json, 'student_labels');
    const csv = await csvToRecord(getManualGradingCsvData(exportRow, options));
    assert.property(csv, 'Group Name');
    assert.notProperty(csv, 'Labels');
  });

  test('exports the latest human and AI grades for the latest submission, including rubric discrepancies', async () => {
    const assessment = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw10-aiGrading',
    });
    let aq = await selectAssessmentQuestion(assessment.id, 'aiGradingRubrics');
    const [student, human, ai] = await generateAndEnrollUsers({
      count: 3,
      course_instance_id: '1',
    });
    const iqId = await insertIndividualInstanceQuestion({
      assessment_id: assessment.id,
      assessment_question_id: aq.id,
      user_id: student.id,
      assigned_grader: human.id,
      last_grader: human.id,
    });
    const variantId = await sqldb.queryScalar(
      sql.insert_variant,
      { instance_question_id: iqId },
      IdSchema,
    );
    const rubricId = await sqldb.queryScalar(
      sql.insert_rubric,
      { assessment_question_id: aq.id },
      IdSchema,
    );
    aq = await selectAssessmentQuestion(assessment.id, 'aiGradingRubrics');
    const humanItem = await sqldb.queryRow(
      sql.insert_rubric_item,
      {
        rubric_id: rubricId,
        number: 1,
        description: 'Human, "only"\nitem',
        points: 6,
        deleted_at: null,
      },
      RubricItemSchema,
    );
    const aiItem = await sqldb.queryRow(
      sql.insert_rubric_item,
      {
        rubric_id: rubricId,
        number: 2,
        description: 'AI only',
        points: 2,
        deleted_at: null,
      },
      RubricItemSchema,
    );
    const humanRubricId = await sqldb.queryScalar(
      sql.insert_rubric_grading,
      {
        rubric_id: rubricId,
        rubric_item_ids: [humanItem.id],
        score: 0.5,
        adjust_points: 0,
        computed_points: 3,
      },
      IdSchema,
    );
    const aiRubricId = await sqldb.queryScalar(
      sql.insert_rubric_grading,
      {
        rubric_id: rubricId,
        rubric_item_ids: [aiItem.id],
        score: 1,
        adjust_points: 0,
        computed_points: 2,
      },
      IdSchema,
    );
    const oldSubmissionId = await sqldb.queryScalar(
      sql.insert_submission,
      {
        variant_id: variantId,
        date: '2020-01-02T00:00:00Z',
        manual_rubric_grading_id: null,
      },
      IdSchema,
    );
    const submissionId = await sqldb.queryScalar(
      sql.insert_submission,
      {
        variant_id: variantId,
        date: '2020-01-03T00:00:00Z',
        manual_rubric_grading_id: humanRubricId,
      },
      IdSchema,
    );
    const insertJob = async (
      overrides: Partial<{
        submission_id: string;
        grading_method: string;
        graded_at: string;
        graded_by: string;
        manual_points: number;
        manual_rubric_grading_id: string;
        deleted_at: string;
      }> = {},
    ) =>
      await sqldb.queryScalar(
        sql.insert_grading_job,
        {
          submission_id: submissionId,
          grading_method: 'AI',
          graded_at: '2020-01-04T00:00:00Z',
          graded_by: ai.id,
          auto_points: 1,
          manual_points: 2,
          feedback: { manual: 'Feedback, "quoted"\nsecond line' },
          manual_rubric_grading_id: aiRubricId,
          deleted_at: null,
          ...overrides,
        },
        IdSchema,
      );
    await insertJob({
      submission_id: oldSubmissionId,
      graded_at: '2020-01-10T00:00:00Z',
      manual_points: 99,
    });
    await insertJob({ graded_at: '2020-01-03T00:00:00Z', manual_points: 98 });
    const aiJobId = await insertJob();
    await insertJob({
      graded_at: '2020-01-09T00:00:00Z',
      manual_points: 97,
      deleted_at: '2020-01-10T00:00:00Z',
    });
    const humanJobId = await insertJob({
      grading_method: 'Manual',
      graded_by: human.id,
      manual_points: 3,
      manual_rubric_grading_id: humanRubricId,
    });
    const aiGroup = await sqldb.queryRow(
      sql.insert_submission_group,
      {
        assessment_question_id: aq.id,
        name: 'AI group',
        description: 'AI grouping',
      },
      StaffInstanceQuestionGroupSchema,
    );
    const humanGroup = await sqldb.queryRow(
      sql.insert_submission_group,
      {
        assessment_question_id: aq.id,
        name: 'Human group',
        description: 'Human grouping',
      },
      StaffInstanceQuestionGroupSchema,
    );
    await sqldb.execute(sql.update_instance_question, {
      instance_question_id: iqId,
      ai_group_id: aiGroup.id,
      manual_group_id: humanGroup.id,
    });
    const options = {
      assessment,
      studentLabels: [],
      instanceQuestionGroups: [aiGroup, humanGroup],
      rubricData: await selectRubricData({ assessment_question: aq }),
    };
    const row = await selectExportRow(assessment, aq, iqId);
    const json = getManualGradingJsonData(row, options);
    assert.equal(json.manual_points, 3);
    assert.equal(json.human_grading?.grading_job_id, humanJobId);
    assert.equal(json.human_grading?.manual_points, 3);
    assert.equal(json.human_grading?.grader?.uid, human.uid);
    assert.equal(json.human_grading?.rubric?.items[0].score, 0.5);
    assert.equal(json.ai_grading?.grading_job_id, aiJobId);
    assert.equal(json.ai_grading?.manual_points, 2);
    assert.equal(json.ai_grading?.grader?.uid, ai.uid);
    assert.equal(json.ai_grading?.graded_at, '2020-01-04T00:00:00.000Z');
    assert.equal(json.ai_grading_status, 'LatestRubric');
    assert.deepEqual(json.submission_group, {
      id: humanGroup.id,
      name: 'Human group',
      description: 'Human grouping',
    });
    assert.deepEqual(json.rubric_items, [
      { rubric_item_id: humanItem.id, description: humanItem.description, points: 6 },
    ]);
    assert.equal(json.ai_grading_comparison.points_ai_minus_human, -1);
    assert.deepEqual(json.ai_grading_comparison.rubric_difference, [
      {
        rubric_item_id: humanItem.id,
        description: humanItem.description,
        points: 6,
        selected_by_ai: false,
        selected_by_human: true,
      },
      {
        rubric_item_id: aiItem.id,
        description: aiItem.description,
        points: 2,
        selected_by_ai: true,
        selected_by_human: false,
      },
    ]);
    const csv = await csvToRecord(getManualGradingCsvData(row, options));
    assert.equal(csv['Manual Points'], '3');
    assert.equal(csv['Human Manual Points'], '3');
    assert.equal(csv['AI Manual Points'], '2');
    assert.equal(csv['Point Difference (AI - Human)'], '-1');
    assert.deepEqual(JSON.parse(csv['Human Grading']), json.human_grading);
    assert.deepEqual(JSON.parse(csv['AI Grading']), json.ai_grading);
    assert.deepEqual(
      JSON.parse(csv['Rubric Difference']),
      json.ai_grading_comparison.rubric_difference,
    );

    await insertJob({
      graded_at: '2020-01-11T00:00:00Z',
      manual_points: 3,
      manual_rubric_grading_id: humanRubricId,
    });
    const agreementRow = await selectExportRow(assessment, aq, iqId);
    const agreementJson = getManualGradingJsonData(agreementRow, options);
    assert.equal(agreementJson.ai_grading_comparison.points_ai_minus_human, 0);
    assert.deepEqual(agreementJson.ai_grading_comparison.rubric_difference, []);
    const agreementCsv = await csvToRecord(getManualGradingCsvData(agreementRow, options));
    assert.equal(agreementCsv['Point Difference (AI - Human)'], '0');
    assert.equal(agreementCsv['Rubric Difference'], '[]');

    await sqldb.execute(sql.delete_rubric_item, { rubric_item_id: humanItem.id });
    const editedRubricRow = await selectExportRow(assessment, aq, iqId);
    const editedRubricJson = getManualGradingJsonData(editedRubricRow, options);
    assert.deepEqual(editedRubricJson.human_grading?.rubric?.items, [
      { rubric_item_id: humanItem.id, description: humanItem.description, points: 6, score: 0.5 },
    ]);
  });

  test('exports zero scores, a missing AI grade, and point-only disagreement without a rubric', async () => {
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
      last_grader: grader.id,
    });
    const variantId = await sqldb.queryScalar(
      sql.insert_variant,
      { instance_question_id: iqId },
      IdSchema,
    );
    const submissionId = await sqldb.queryScalar(
      sql.insert_submission,
      {
        variant_id: variantId,
        date: '2020-01-02T00:00:00Z',
        manual_rubric_grading_id: null,
      },
      IdSchema,
    );
    const options = { assessment, studentLabels: [], instanceQuestionGroups: [], rubricData: null };

    for (const grading_method of ['Manual', 'AI']) {
      await sqldb.queryScalar(
        sql.insert_grading_job,
        {
          submission_id: submissionId,
          grading_method,
          graded_at: '2020-01-03T00:00:00Z',
          graded_by: grader.id,
          auto_points: 0,
          manual_points: grading_method === 'Manual' ? 0 : 2,
          feedback: null,
          manual_rubric_grading_id: null,
          deleted_at: null,
        },
        IdSchema,
      );
      const row = await selectExportRow(assessment, aq, iqId);
      const json = getManualGradingJsonData(row, options);
      const csv = await csvToRecord(getManualGradingCsvData(row, options));
      assert.equal(json.human_grading?.manual_points, 0);
      assert.isNull(json.human_grading?.rubric);
      assert.equal(csv['Human Manual Points'], '0');
      assert.isNull(json.ai_grading_comparison.rubric_difference);
      if (grading_method === 'Manual') {
        assert.isNull(json.ai_grading);
        assert.isNull(json.ai_grading_comparison.points_ai_minus_human);
        assert.equal(csv['AI Grading'], '');
        assert.equal(csv['Point Difference (AI - Human)'], '');
      } else {
        assert.equal(json.ai_grading?.manual_points, 2);
        assert.equal(json.ai_grading_status, 'Graded');
        assert.equal(json.ai_grading_comparison.points_ai_minus_human, 2);
        assert.equal(csv['Point Difference (AI - Human)'], '2');
      }
    }
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
    assert.equal(json.human_grading?.auto_points_source?.grading_job_id, autoUpdate.grading_job_id);
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
    const csv = await csvToRecord(getManualGradingCsvData(row, options));
    assert.equal(csv['Human Manual Points'], '3');
    assert.equal(csv['Point Difference (AI - Human)'], '-1');
    assert.deepEqual(JSON.parse(csv['Human Grading']), json.human_grading);

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
    assert.isNotNull(conflictJob.deleted_at);
    assert.equal(conflictJob.deleted_by, grader.id);
    const json = getManualGradingJsonData(await selectExportRow(assessment, aq, iqId), options);
    assert.equal(json.manual_points, 3);
    assert.equal(json.human_grading?.manual_points, 3);
    assert.equal(json.human_grading?.grading_job_id, humanScore.grading_job_id);
    assert.equal(json.ai_grading_comparison.points_ai_minus_human, -1);

    await deleteAiGradingJobs({ assessment_question_ids: [aq.id], authn_user_id: grader.id });
    const restored = getManualGradingJsonData(await selectExportRow(assessment, aq, iqId), options);
    assert.equal(restored.manual_points, 3);
    assert.deepEqual(restored.human_grading?.feedback, { manual: 'Score 3' });
    assert.isNull(restored.ai_grading);
  });
});
