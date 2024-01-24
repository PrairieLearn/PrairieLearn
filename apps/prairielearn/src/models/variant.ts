import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

const sql = loadSqlEquiv(__filename);

export async function resetVariantsForAssessmentQuestion({
  assessment_id,
  unsafe_assessment_question_id,
  authn_user_id,
}: {
  assessment_id: string;
  unsafe_assessment_question_id: string;
  authn_user_id: string;
}) {
  await queryAsync(sql.reset_variants_for_assessment_question, {
    assessment_id,
    unsafe_assessment_question_id,
    authn_user_id,
  });
}

export async function resetVariantsForInstanceQuestion({
  assessment_instance_id,
  unsafe_instance_question_id,
  authn_user_id,
}: {
  assessment_instance_id: string;
  unsafe_instance_question_id: string;
  authn_user_id: string;
}) {
  await queryAsync(sql.reset_variants_for_instance_question, {
    assessment_instance_id,
    unsafe_instance_question_id,
    authn_user_id,
  });
}
