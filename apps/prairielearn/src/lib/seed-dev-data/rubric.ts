import { type RubricItemInput } from '../manualGrading.types.js';

export interface FakeRubricConfig {
  starting_points: number;
  min_points: number;
  max_extra_points: number;
  replace_auto_points: boolean;
  grader_guidelines: string | null;
  rubric_items: RubricItemInput[];
}

/**
 * Generates a plausible test rubric whose positive items sum to `maxPoints`,
 * plus an optional negative "style/formatting penalty" item. Used to populate a
 * manually-graded question for dev testing of the manual-grading UI.
 *
 * Point weights use `Math.random`, so the generated rubric varies between runs.
 * This non-determinism is acceptable for dev fixtures.
 */
export function generateFakeRubric({
  numItems,
  includeNegativeItem,
  replaceAutoPoints,
  maxPoints,
}: {
  numItems: number;
  includeNegativeItem: boolean;
  replaceAutoPoints: boolean;
  maxPoints: number;
}): FakeRubricConfig {
  const positiveCount = includeNegativeItem ? numItems - 1 : numItems;
  if (positiveCount < 1) {
    throw new Error(
      `numItems must be at least ${includeNegativeItem ? 2 : 1} when includeNegativeItem is ${includeNegativeItem}`,
    );
  }

  // Generate random weights then scale so positive items sum exactly to maxPoints.
  const rawWeights = Array.from({ length: positiveCount }, () => 0.5 + Math.random());
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const rawPoints = rawWeights.map((w) => (w / weightSum) * maxPoints);

  // Round to one decimal place, then adjust the last item to absorb rounding error.
  const roundedPoints = rawPoints.map((p) => Math.round(p * 10) / 10);
  const roundingError = maxPoints - roundedPoints.reduce((a, b) => a + b, 0);
  roundedPoints[roundedPoints.length - 1] =
    Math.round((roundedPoints[roundedPoints.length - 1] + roundingError) * 10) / 10;

  const items: RubricItemInput[] = [];
  for (let i = 0; i < positiveCount; i++) {
    items.push({
      order: i,
      description: `Criterion ${i + 1}`,
      points: roundedPoints[i],
      explanation: `Award points if the student demonstrates criterion ${i + 1}.`,
      grader_note: `Look for evidence of criterion ${i + 1} in the student's response.`,
      always_show_to_students: true,
    });
  }

  if (includeNegativeItem) {
    const avgPoints = maxPoints / positiveCount;
    const penalty = -Math.round(avgPoints * 0.5 * 10) / 10;
    items.push({
      order: positiveCount,
      description: 'Style/formatting penalty',
      points: penalty,
      explanation: 'Deduct points for poor style or formatting.',
      grader_note:
        'Check for inconsistent formatting, unclear variable names, or missing comments.',
      always_show_to_students: true,
    });
  }

  return {
    starting_points: 0,
    min_points: 0,
    max_extra_points: 0,
    replace_auto_points: replaceAutoPoints,
    grader_guidelines: 'This is a generated test rubric for development testing.',
    rubric_items: items,
  };
}
