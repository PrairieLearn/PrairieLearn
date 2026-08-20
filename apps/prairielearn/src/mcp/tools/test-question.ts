import { type Course } from '../../lib/db-types.js';
import {
  type QuestionTestResult,
  questionSupportsTesting,
  runQuestionTests,
} from '../../lib/question-testing.js';
import { selectQuestionByQid } from '../../models/question.js';

/** A variant that rendered without error but looks suspicious anyway. */
interface Warning {
  variantSeed: string;
  message: string;
}

/**
 * Flags variants that "work" but are probably wrong. These are the failures that
 * a pass/fail test cycle misses entirely: an answer that collides with a
 * distractor, an unrendered Mustache tag, a degenerate zero answer.
 */
function findWarnings(results: QuestionTestResult[]): Warning[] {
  const warnings: Warning[] = [];

  for (const result of results) {
    // Only inspect the `correct` runs — the others deliberately submit bad data.
    if (result.testType !== 'correct' || !result.success) continue;

    const answers = Object.entries(result.trueAnswer ?? {});

    for (const [name, value] of answers) {
      if (value === 0 || value === '0') {
        warnings.push({
          variantSeed: result.variantSeed,
          message: `Correct answer "${name}" is zero, which is often a degenerate variant.`,
        });
      }
    }

    // A correct answer that also appears among the generated parameters is
    // usually a distractor collision.
    const paramValues = Object.entries(result.params ?? {});
    for (const [answerName, answerValue] of answers) {
      if (answerValue == null || typeof answerValue === 'object') continue;
      for (const [paramName, paramValue] of paramValues) {
        if (paramValue == null || typeof paramValue === 'object') continue;
        if (String(paramValue) !== String(answerValue)) continue;
        // Params that the question intentionally derives from the answer are
        // common, so only flag names that look like alternatives.
        if (!/distract|option|choice|wrong|incorrect/i.test(paramName)) continue;
        warnings.push({
          variantSeed: result.variantSeed,
          message: `Parameter "${paramName}" equals correct answer "${answerName}" (${String(answerValue)}).`,
        });
      }
    }
  }

  return warnings;
}

export interface TestQuestionResult {
  qid: string;
  questionId: string;
  passed: boolean;
  summary: { total: number; passed: number; failed: number };
  /** Only the failures, so the agent isn't handed a wall of successes. */
  failures: QuestionTestResult[];
  warnings: Warning[];
}

/**
 * Renders a question across many random variants and submits correct, incorrect,
 * and invalid answers to each, returning structured results.
 *
 * Failures include the variant seed, so the agent can reproduce any one of them
 * deterministically by calling this again with the same `seedPrefix`.
 */
export async function testQuestionTool({
  course,
  qid,
  count,
  seedPrefix,
  userId,
  authnUserId,
}: {
  course: Course;
  qid: string;
  count: number;
  seedPrefix?: string;
  userId: string;
  authnUserId: string;
}): Promise<TestQuestionResult> {
  const question = await selectQuestionByQid({ course_id: course.id, qid });

  if (!questionSupportsTesting(question)) {
    throw new Error(
      `Question "${qid}" does not support automated testing (only v3 "Freeform" questions do).`,
    );
  }

  const results = await runQuestionTests({
    question,
    course,
    count,
    user_id: userId,
    authn_user_id: authnUserId,
    variantSeedPrefix: seedPrefix,
  });

  const failures = results.filter((result) => !result.success);

  return {
    qid,
    questionId: question.id,
    passed: failures.length === 0,
    summary: {
      total: results.length,
      passed: results.length - failures.length,
      failed: failures.length,
    },
    failures,
    warnings: findWarnings(results),
  };
}
