import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';
import z from 'zod';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import * as helperDb from '../tests/helperDb.js';

import {
  AssessmentQuestionSchema,
  AssessmentSchema,
  InstanceQuestionSchema,
  VariantSchema,
} from './db-types.js';
import { updateInstanceQuestionGrade } from './question-points.js';

const sql = loadSqlEquiv(import.meta.url);

describe('updateInstanceQuestionGrade', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  let testData: {
    user_id: string;
    course_id: string;
    course_instance_id: string;
    assessment_set_id: string;
    question_id: string;
  };

  // Initialize test data before all tests
  beforeAll(async () => {
    testData = await queryRow(
      sql.setup_test_data,
      {},
      z.object({
        user_id: z.string(),
        course_id: z.string(),
        course_instance_id: z.string(),
        assessment_set_id: z.string(),
        question_id: z.string(),
      }),
    );
  });

  /**
   * Reset database before each test to ensure clean state.
   * This is necessary because tests create records with specific IDs and we need
   * to avoid primary key conflicts between tests. While this is slower than
   * transaction-based rollback, it ensures complete isolation between tests.
   */
  beforeEach(async () => {
    await helperDb.resetDatabase();
    // Re-initialize test data after reset
    testData = await queryRow(
      sql.setup_test_data,
      {},
      z.object({
        user_id: z.string(),
        course_id: z.string(),
        course_instance_id: z.string(),
        assessment_set_id: z.string(),
        question_id: z.string(),
      }),
    );
  });

  /**
   * Helper to create a homework assessment with specified configuration.
   * Creates full test setup: assessment, assessment_question, assessment_instance,
   * instance_question, and variant.
   */
  async function createHomeworkTest({
    assessment_id = '1',
    assessment_question_id = '1',
    instance_question_id = '1',
    variant_id = '1',
    grading_job_id = '1',
    max_points = 10,
    max_auto_points = null as number | null,
    max_manual_points = null as number | null,
    init_points = 5,
    constant_question_value = false,
    initial_manual_points = 0,
  }: {
    assessment_id?: string;
    assessment_question_id?: string;
    instance_question_id?: string;
    variant_id?: string;
    grading_job_id?: string;
    max_points?: number;
    max_auto_points?: number | null;
    max_manual_points?: number | null;
    init_points?: number;
    constant_question_value?: boolean;
    initial_manual_points?: number;
  } = {}) {
    const assessment = await queryRow(
      sql.create_homework_assessment,
      {
        assessment_id,
        course_instance_id: testData.course_instance_id,
        title: 'Test Homework',
        assessment_set_id: testData.assessment_set_id,
        tid: `hw-test-${assessment_id}`,
        constant_question_value,
      },
      AssessmentSchema,
    );

    const assessment_question = await queryRow(
      sql.create_assessment_question,
      {
        assessment_question_id,
        assessment_id: assessment.id,
        question_id: testData.question_id,
        number: 1,
        max_points,
        max_auto_points: max_auto_points ?? max_points,
        max_manual_points: max_manual_points ?? 0,
        init_points,
        points_list: null,
      },
      AssessmentQuestionSchema,
    );

    const assessment_instance = await queryRow(
      sql.create_assessment_instance,
      {
        assessment_instance_id: assessment_id, // Use same ID for simplicity
        assessment_id: assessment.id,
        user_id: testData.user_id,
      },
      z.object({ id: z.string() }),
    );

    const instance_question = await queryRow(
      sql.create_instance_question,
      {
        instance_question_id,
        assessment_instance_id: assessment_instance.id,
        assessment_question_id: assessment_question.id,
        number: 1,
        points: initial_manual_points,
        auto_points: 0,
        manual_points: initial_manual_points,
        score_perc: 0,
        open: true,
        status: 'unanswered',
        current_value: init_points,
        points_list: null,
        points_list_original: null,
        highest_submission_score: null,
        variants_points_list: [],
        number_attempts: 0,
      },
      InstanceQuestionSchema,
    );

    const variant = await queryRow(
      sql.create_variant,
      {
        variant_id,
        instance_question_id: instance_question.id,
        question_id: testData.question_id,
        course_id: testData.course_id,
        user_id: testData.user_id,
        authn_user_id: testData.user_id,
      },
      VariantSchema,
    );

    return {
      assessment,
      assessment_question,
      assessment_instance,
      instance_question,
      variant,
      grading_job_id,
    };
  }

  /**
   * Helper to create an exam assessment with specified configuration.
   * Creates full test setup: assessment, assessment_question, assessment_instance,
   * instance_question, and variant.
   */
  async function createExamTest({
    assessment_id = '100',
    assessment_question_id = '100',
    instance_question_id = '100',
    variant_id = '100',
    grading_job_id = '100',
    max_points = 10,
    max_auto_points = null as number | null,
    max_manual_points = null as number | null,
    points_list = [10, 7, 4, 1],
    initial_manual_points = 0,
  }: {
    assessment_id?: string;
    assessment_question_id?: string;
    instance_question_id?: string;
    variant_id?: string;
    grading_job_id?: string;
    max_points?: number;
    max_auto_points?: number | null;
    max_manual_points?: number | null;
    points_list?: number[];
    initial_manual_points?: number;
  } = {}) {
    const assessment = await queryRow(
      sql.create_exam_assessment,
      {
        assessment_id,
        course_instance_id: testData.course_instance_id,
        title: 'Test Exam',
        assessment_set_id: testData.assessment_set_id,
        tid: `exam-test-${assessment_id}`,
      },
      AssessmentSchema,
    );

    const assessment_question = await queryRow(
      sql.create_assessment_question,
      {
        assessment_question_id,
        assessment_id: assessment.id,
        question_id: testData.question_id,
        number: 1,
        max_points,
        max_auto_points: max_auto_points ?? max_points,
        max_manual_points: max_manual_points ?? 0,
        init_points: null,
        points_list,
      },
      AssessmentQuestionSchema,
    );

    const assessment_instance = await queryRow(
      sql.create_assessment_instance,
      {
        assessment_instance_id: assessment_id,
        assessment_id: assessment.id,
        user_id: testData.user_id,
      },
      z.object({ id: z.string() }),
    );

    const instance_question = await queryRow(
      sql.create_instance_question,
      {
        instance_question_id,
        assessment_instance_id: assessment_instance.id,
        assessment_question_id: assessment_question.id,
        number: 1,
        points: initial_manual_points,
        auto_points: 0,
        manual_points: initial_manual_points,
        score_perc: 0,
        open: true,
        status: 'unanswered',
        current_value: points_list[0],
        points_list,
        points_list_original: points_list,
        highest_submission_score: null,
        variants_points_list: [],
        number_attempts: 0,
      },
      InstanceQuestionSchema,
    );

    const variant = await queryRow(
      sql.create_variant,
      {
        variant_id,
        instance_question_id: instance_question.id,
        question_id: testData.question_id,
        course_id: testData.course_id,
        user_id: testData.user_id,
        authn_user_id: testData.user_id,
      },
      VariantSchema,
    );

    return {
      assessment,
      assessment_question,
      assessment_instance,
      instance_question,
      variant,
      grading_job_id,
    };
  }

  /**
   * Helper to generate a sequential grading job ID for a test.
   * Combines base test ID with sequence number to ensure uniqueness.
   * @param baseId - The base ID from the test (e.g., '14' for assessment_id '14')
   * @param sequence - The sequence number (1, 2, 3, etc.)
   * @returns A unique grading job ID like '141', '142', '143'
   */
  function makeGradingJobId(baseId: string, sequence: number): string {
    return `${baseId}${sequence}`;
  }

  /**
   * Helper to create a grading job for testing.
   * Creates both a submission and a grading job linked to the variant.
   * Submission ID is generated by prefixing grading job ID with '1' to ensure uniqueness.
   */
  async function createGradingJob(variant_id: string, grading_job_id: string) {
    // Prefix grading job ID with '1' to create unique submission ID
    const submission_id = `1${grading_job_id}`;

    await queryRow(
      sql.create_submission,
      {
        submission_id,
        variant_id,
        auth_user_id: testData.user_id,
      },
      z.object({ id: z.string() }),
    );

    await queryRow(
      sql.create_grading_job,
      {
        grading_job_id,
        submission_id,
        auth_user_id: testData.user_id,
      },
      z.object({ id: z.string() }),
    );

    return grading_job_id;
  }

  /**
   * Helper to check instance question state against expected values.
   * Uses approximate equality for numeric fields to handle floating point precision.
   * @returns The instance question record for further inspection if needed
   */
  async function checkInstanceQuestion(
    instance_question_id: string,
    expected: Partial<z.infer<typeof InstanceQuestionSchema>>,
  ) {
    const iq = await queryRow(
      sql.get_instance_question,
      { instance_question_id },
      InstanceQuestionSchema,
    );

    // Check numeric fields with approximate equality
    const numericFields: (keyof typeof expected)[] = [
      'points',
      'auto_points',
      'manual_points',
      'current_value',
      'highest_submission_score',
    ];

    for (const field of numericFields) {
      if (expected[field] !== undefined) {
        const expectedValue = expected[field];
        const actualValue = iq[field];

        if (expectedValue === null) {
          assert.isNull(actualValue, `${String(field)} should be null`);
        } else if (typeof expectedValue === 'number') {
          const actualNumber = typeof actualValue === 'number' ? actualValue : 0;
          assert.approximately(actualNumber, expectedValue, 0.0001, `${String(field)} mismatch`);
        }
      }
    }

    // Check boolean fields
    if (expected.status !== undefined) {
      assert.equal(iq.status, expected.status, 'status mismatch');
    }
    if (expected.open !== undefined) {
      assert.equal(iq.open, expected.open, 'open mismatch');
    }

    // Check array fields
    if (expected.points_list !== undefined) {
      if (expected.points_list === null) {
        assert.isNull(iq.points_list, 'points_list should be null');
      } else {
        assert.deepEqual(iq.points_list, expected.points_list, 'points_list mismatch');
      }
    }
    if (expected.variants_points_list !== undefined) {
      assert.deepEqual(
        iq.variants_points_list,
        expected.variants_points_list,
        'variants_points_list mismatch',
      );
    }

    return iq;
  }

  describe('Homework', () => {
    describe('basic scoring', () => {
      it('should award points matching submission score × current_value', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '10',
          instance_question_id: '10',
          variant_id: '10',
          grading_job_id: '10',
          init_points: 5,
          max_points: 20,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        // Submit 60% answer
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.6,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        // Should get 0.6 * 5 = 3 points
        await checkInstanceQuestion(instance_question.id, {
          points: 3,
          auto_points: 3,
          manual_points: 0,
          status: 'incorrect',
          highest_submission_score: 0.6,
        });
      });

      it('should handle 100% score correctly', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '11',
          instance_question_id: '11',
          variant_id: '11',
          grading_job_id: '11',
          init_points: 5,
          max_points: 20,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        // Submit 100% answer
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        // Should get full 5 points
        await checkInstanceQuestion(instance_question.id, {
          points: 5,
          auto_points: 5,
          manual_points: 0,
          status: 'correct',
          highest_submission_score: 1,
        });
      });
    });

    describe('value increase on correct answer', () => {
      it('should increase current_value after 100% score when constant_question_value is false', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '12',
          instance_question_id: '12',
          variant_id: '12',
          grading_job_id: '12',
          init_points: 5,
          max_points: 20,
          constant_question_value: false,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        // Submit 100% answer
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        // current_value should double: 5 + 5 = 10
        await checkInstanceQuestion(instance_question.id, {
          current_value: 10,
          status: 'correct',
        });
      });

      it('should NOT increase current_value when constant_question_value is true', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '13',
          instance_question_id: '13',
          variant_id: '13',
          grading_job_id: '13',
          init_points: 5,
          max_points: 20,
          constant_question_value: true,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        // Submit 100% answer
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        // current_value should stay the same
        await checkInstanceQuestion(instance_question.id, {
          current_value: 5,
          status: 'correct',
        });
      });
    });

    describe('max points cap', () => {
      it('should cap total points at max_points', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '14',
          instance_question_id: '14',
          variant_id: '14',
          grading_job_id: '14',
          init_points: 5,
          max_points: 12,
          constant_question_value: false,
        });

        // Create first grading job
        await createGradingJob(variant.id, grading_job_id);

        // Submit first 100% answer -> 5 points, value becomes 10
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          points: 5,
          auto_points: 5,
          current_value: 10,
        });

        // Create second grading job
        const grading_job_id_2 = makeGradingJobId('14', 2);
        await createGradingJob(variant.id, grading_job_id_2);

        // Submit second 100% answer -> should get 7 more points (capped at 12 total)
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id: grading_job_id_2,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          points: 12, // Capped at max_points
          auto_points: 12,
          current_value: 12, // Capped at max_points
        });
      });
    });

    describe('manual/auto points split', () => {
      it('should update only auto_points when there are manual points', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '15',
          instance_question_id: '15',
          variant_id: '15',
          grading_job_id: '15',
          init_points: 5,
          max_points: 8,
          max_auto_points: 5,
          max_manual_points: 3,
          initial_manual_points: 2, // Already has 2 manual points
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        // Submit 100% answer
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        // current_value is 5, but auto portion is 5 - maxManualPoints(3) = 2
        // So we get 2 auto points + existing 2 manual points = 4 total
        await checkInstanceQuestion(instance_question.id, {
          points: 4,
          auto_points: 2,
          manual_points: 2,
          status: 'correct',
        });
      });

      it('should handle partial scores with manual points', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '16',
          instance_question_id: '16',
          variant_id: '16',
          grading_job_id: '16',
          init_points: 4,
          max_points: 10,
          max_auto_points: 7,
          max_manual_points: 3,
          initial_manual_points: 2,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        // Submit 50% answer
        // current_value is 4, auto portion is 4 - 3 = 1
        // auto_points = 0.5 * 1 = 0.5
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.5,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        // Should get 0.5 auto points + existing 2 manual points = 2.5 total
        await checkInstanceQuestion(instance_question.id, {
          points: 2.5,
          auto_points: 0.5,
          manual_points: 2,
          status: 'incorrect',
        });
      });
    });

    describe('status logic', () => {
      it('should set status to correct after any 100% submission', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '17',
          instance_question_id: '17',
          variant_id: '17',
          grading_job_id: '17',
          init_points: 5,
          max_points: 20,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          status: 'correct',
        });
      });

      it('should set status to complete when max_auto_points reached and no manual points', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '18',
          instance_question_id: '18',
          variant_id: '18',
          grading_job_id: '18',
          init_points: 10,
          max_points: 10,
          max_auto_points: 10,
          max_manual_points: 0,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          status: 'complete',
          auto_points: 10,
          points: 10,
        });
      });

      it('should set status to correct (not complete) when max auto reached but manual points exist', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '19',
          instance_question_id: '19',
          variant_id: '19',
          grading_job_id: '19',
          init_points: 7,
          max_points: 10,
          max_auto_points: 7,
          max_manual_points: 3,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        // current_value is 7, auto portion is 7 - 3 = 4
        // So we get 4 auto points
        await checkInstanceQuestion(instance_question.id, {
          status: 'correct', // Not 'complete' because manual points exist
          auto_points: 4,
        });
      });

      it('should set status to incorrect for non-100% submissions', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '20',
          instance_question_id: '20',
          variant_id: '20',
          grading_job_id: '20',
          init_points: 5,
          max_points: 20,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.75,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          status: 'incorrect',
        });
      });
    });
  });

  describe('Exam', () => {
    describe('partial score incremental points', () => {
      it('should award incremental points for score improvements', async () => {
        const { instance_question, variant } = await createExamTest({
          assessment_id: '101',
          instance_question_id: '101',
          variant_id: '101',
          grading_job_id: '101',
          points_list: [10, 7, 4, 1],
        });

        // Create first grading job
        const grading_job_id_1 = makeGradingJobId('101', 1);
        await createGradingJob(variant.id, grading_job_id_1);

        // First attempt: 30% -> get 0.3 * 10 = 3 points
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.3,
          grading_job_id: grading_job_id_1,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          auto_points: 3,
          points: 3,
          highest_submission_score: 0.3,
          status: 'incorrect',
        });

        // Create second grading job
        const grading_job_id_2 = makeGradingJobId('101', 2);
        await createGradingJob(variant.id, grading_job_id_2);

        // Second attempt: 70% -> get (0.7 - 0.3) * 7 = 0.4 * 7 = 2.8 more points
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.7,
          grading_job_id: grading_job_id_2,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          auto_points: 5.8, // 3 + 2.8
          points: 5.8,
          highest_submission_score: 0.7,
          status: 'incorrect',
        });
      });
    });

    describe('score decrease does not reduce points', () => {
      it('should not reduce points when score decreases', async () => {
        const { instance_question, variant } = await createExamTest({
          assessment_id: '102',
          instance_question_id: '102',
          variant_id: '102',
          grading_job_id: '102',
          points_list: [10, 7, 4],
        });

        // Create first grading job
        const grading_job_id_1 = makeGradingJobId('102', 1);
        await createGradingJob(variant.id, grading_job_id_1);

        // First attempt: 80%
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.8,
          grading_job_id: grading_job_id_1,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          auto_points: 8,
          highest_submission_score: 0.8,
        });

        // Create second grading job
        const grading_job_id_2 = makeGradingJobId('102', 2);
        await createGradingJob(variant.id, grading_job_id_2);

        // Second attempt: 40% (lower than before)
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.4,
          grading_job_id: grading_job_id_2,
          authn_user_id: testData.user_id,
        });

        // Points should not change
        await checkInstanceQuestion(instance_question.id, {
          auto_points: 8, // Same as before
          highest_submission_score: 0.8, // Still 0.8
        });
      });
    });

    describe('points_list reduction', () => {
      it('should reduce points_list values based on highest score', async () => {
        const { instance_question, variant } = await createExamTest({
          assessment_id: '103',
          instance_question_id: '103',
          variant_id: '103',
          grading_job_id: '103',
          points_list: [10, 8, 6, 4],
        });

        // Create grading job
        const grading_job_id_1 = makeGradingJobId('103', 1);
        await createGradingJob(variant.id, grading_job_id_1);

        // First attempt: 40%
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.4,
          grading_job_id: grading_job_id_1,
          authn_user_id: testData.user_id,
        });

        const iq = await checkInstanceQuestion(instance_question.id, {
          highest_submission_score: 0.4,
        });

        // Remaining points should be scaled by (1 - 0.4) = 0.6
        // Next attempts: 0.6 * 8 = 4.8, 0.6 * 6 = 3.6, 0.6 * 4 = 2.4
        assert.lengthOf(iq.points_list ?? [], 3);
        assert.approximately((iq.points_list ?? [])[0], 4.8, 0.0001);
        assert.approximately((iq.points_list ?? [])[1], 3.6, 0.0001);
        assert.approximately((iq.points_list ?? [])[2], 2.4, 0.0001);
      });
    });

    describe('full score behavior', () => {
      it('should close question after 100% with no manual points', async () => {
        const { instance_question, variant, grading_job_id } = await createExamTest({
          assessment_id: '104',
          instance_question_id: '104',
          variant_id: '104',
          grading_job_id: '104',
          points_list: [10, 7, 4],
          max_auto_points: 10,
          max_manual_points: 0,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          auto_points: 10,
          points: 10,
          open: false,
          status: 'complete',
          points_list: [],
        });
      });
    });

    describe('manual points keep question open', () => {
      it('should keep question open after 100% if manual points exist', async () => {
        const { instance_question, variant, grading_job_id } = await createExamTest({
          assessment_id: '105',
          instance_question_id: '105',
          variant_id: '105',
          grading_job_id: '105',
          points_list: [8, 6, 4],
          max_auto_points: 8,
          max_manual_points: 2,
        });

        // Create grading job
        await createGradingJob(variant.id, grading_job_id);

        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        // points_list[0] is 8, but auto portion is 8 - maxManualPoints(2) = 6
        // So 100% gives 6 auto_points
        const iq = await checkInstanceQuestion(instance_question.id, {
          auto_points: 6,
          open: true, // Still open because of manual points
          status: 'correct', // Correct but not complete
        });

        // Should still have attempts available (but all reduced to manual points only)
        assert.isAbove((iq.points_list ?? []).length, 0);
      });
    });

    describe('multiple attempts with varying scores', () => {
      it('should correctly accumulate points from multiple attempts', async () => {
        const { instance_question, variant } = await createExamTest({
          assessment_id: '106',
          instance_question_id: '106',
          variant_id: '106',
          grading_job_id: '106',
          points_list: [10, 8, 6, 4, 2],
        });

        // Create grading job for attempt 1
        const grading_job_id_1 = makeGradingJobId('106', 1);
        await createGradingJob(variant.id, grading_job_id_1);

        // Attempt 1: 20% -> 0.2 * 10 = 2 points
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.2,
          grading_job_id: grading_job_id_1,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          auto_points: 2,
          highest_submission_score: 0.2,
        });

        // Create grading job for attempt 2
        const grading_job_id_2 = makeGradingJobId('106', 2);
        await createGradingJob(variant.id, grading_job_id_2);

        // Attempt 2: 50% -> (0.5 - 0.2) * 8 = 0.3 * 8 = 2.4 points
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.5,
          grading_job_id: grading_job_id_2,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          auto_points: 4.4, // 2 + 2.4
          highest_submission_score: 0.5,
        });

        // Create grading job for attempt 3
        const grading_job_id_3 = makeGradingJobId('106', 3);
        await createGradingJob(variant.id, grading_job_id_3);

        // Attempt 3: 30% (lower, no change)
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.3,
          grading_job_id: grading_job_id_3,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          auto_points: 4.4, // No change
          highest_submission_score: 0.5, // Still 0.5
        });

        // Create grading job for attempt 4
        const grading_job_id_4 = makeGradingJobId('106', 4);
        await createGradingJob(variant.id, grading_job_id_4);

        // Attempt 4 uses points_list[3] = 4 (not 6)
        // 80% -> (0.8 - 0.5) * 4 = 0.3 * 4 = 1.2 points
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.8,
          grading_job_id: grading_job_id_4,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          auto_points: 5.6, // 4.4 + 1.2
          highest_submission_score: 0.8,
          status: 'incorrect',
        });
      });
    });
  });

  describe('Edge Cases', () => {
    describe('zero and very small scores', () => {
      it('should handle zero score correctly in homework', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '30',
          instance_question_id: '30',
          variant_id: '30',
          grading_job_id: '30',
          init_points: 5,
          max_points: 10,
        });

        await createGradingJob(variant.id, grading_job_id);

        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          points: 0,
          auto_points: 0,
          status: 'incorrect',
          highest_submission_score: 0,
        });
      });

      it('should handle zero score correctly in exam', async () => {
        const { instance_question, variant, grading_job_id } = await createExamTest({
          assessment_id: '110',
          instance_question_id: '110',
          variant_id: '110',
          grading_job_id: '110',
          points_list: [10, 7, 4],
        });

        await createGradingJob(variant.id, grading_job_id);

        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          points: 0,
          auto_points: 0,
          status: 'incorrect',
          highest_submission_score: 0,
        });
      });

      it('should handle very small decimal scores with floating point precision', async () => {
        const { instance_question, variant, grading_job_id } = await createHomeworkTest({
          assessment_id: '31',
          instance_question_id: '31',
          variant_id: '31',
          grading_job_id: '31',
          init_points: 3,
          max_points: 10,
        });

        await createGradingJob(variant.id, grading_job_id);

        // Very small score that might have floating point issues
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.0001,
          grading_job_id,
          authn_user_id: testData.user_id,
        });

        // Should be approximately 0.0001 * 3 = 0.0003 points
        await checkInstanceQuestion(instance_question.id, {
          points: 0.0003,
          auto_points: 0.0003,
          status: 'incorrect',
        });
      });
    });

    describe('exam with manual/auto split', () => {
      it('should handle manual points with partial scores on multiple attempts', async () => {
        const { instance_question, variant } = await createExamTest({
          assessment_id: '111',
          instance_question_id: '111',
          variant_id: '111',
          grading_job_id: '111',
          points_list: [10, 7, 4],
          max_auto_points: 8,
          max_manual_points: 2,
          initial_manual_points: 1,
        });

        // Create first grading job
        const grading_job_id_1 = makeGradingJobId('111', 1);
        await createGradingJob(variant.id, grading_job_id_1);

        // First attempt: 50%
        // points_list[0] is 10, auto portion is 10 - 2 = 8
        // 50% of 8 = 4 auto points
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 0.5,
          grading_job_id: grading_job_id_1,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          auto_points: 4,
          manual_points: 1,
          points: 5,
          highest_submission_score: 0.5,
          status: 'incorrect',
        });

        // Create second grading job
        const grading_job_id_2 = makeGradingJobId('111', 2);
        await createGradingJob(variant.id, grading_job_id_2);

        // Second attempt: 100%
        // points_list[1] is 7, auto portion is 7 - 2 = 5
        // (1 - 0.5) * 5 = 0.5 * 5 = 2.5 more auto points
        await updateInstanceQuestionGrade({
          variant_id: variant.id,
          instance_question_id: instance_question.id,
          submissionScore: 1,
          grading_job_id: grading_job_id_2,
          authn_user_id: testData.user_id,
        });

        await checkInstanceQuestion(instance_question.id, {
          auto_points: 6.5, // 4 + 2.5
          manual_points: 1,
          points: 7.5,
          highest_submission_score: 1,
          status: 'correct',
        });
      });
    });
  });
});
