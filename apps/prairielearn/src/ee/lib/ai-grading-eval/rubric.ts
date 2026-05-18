import { type Assessment } from '../../../lib/db-types.js';
import { updateAssessmentQuestionRubric } from '../../../lib/manualGrading.js';

import { type RubricFile } from './manifest.js';

/**
 * Upserts the manifest's rubric onto the synthetic AQ. The rubric JSON shape
 * is PL's rubric-settings export, which maps 1:1 onto
 * `updateAssessmentQuestionRubric()` arguments — `max_points` /
 * `max_manual_points` / `max_auto_points` are derived from the AQ on import
 * and intentionally not forwarded.
 */
export async function applyRubric({
  assessment,
  assessment_question_id,
  rubric,
  authn_user_id,
}: {
  assessment: Assessment;
  assessment_question_id: string;
  rubric: RubricFile;
  authn_user_id: string;
}): Promise<void> {
  await updateAssessmentQuestionRubric({
    assessment,
    assessment_question_id,
    use_rubric: true,
    replace_auto_points: rubric.replace_auto_points,
    starting_points: rubric.starting_points,
    min_points: rubric.min_points,
    max_extra_points: rubric.max_extra_points,
    rubric_items: rubric.rubric_items.map((item) => ({
      order: item.order,
      points: item.points,
      description: item.description,
      explanation: item.explanation,
      grader_note: item.grader_note,
      always_show_to_students: item.always_show_to_students,
    })),
    tag_for_manual_grading: false,
    grader_guidelines: rubric.grader_guidelines || null,
    authn_user_id,
  });
}
