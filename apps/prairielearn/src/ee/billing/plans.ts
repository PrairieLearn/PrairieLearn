import { z } from 'zod';
import { loadSqlEquiv, queryAsync, queryRows } from '@prairielearn/postgres';
import { PlanGrant, PlanGrantSchema } from '../../lib/db-types';
import { PLAN_NAMES, PlanName } from './plans-types';

const sql = loadSqlEquiv(__filename);

export interface PlanGrantUpdate {
  plan: PlanName;
  grantType: 'trial' | 'stripe' | 'invoice' | 'gift';
}

export async function getPlanGrantsForInstitution(institution_id: string): Promise<PlanGrant[]> {
  return queryRows(sql.select_plan_grants_for_institution, { institution_id }, PlanGrantSchema);
}

export async function getPlanGrantsForCourseInstance(
  course_instance_id: string
): Promise<PlanGrant[]> {
  return queryRows(
    sql.select_plan_grants_for_course_instance,
    { course_instance_id },
    PlanGrantSchema
  );
}

export async function getRequiredPlansForCourseInstance(
  course_instance_id: string
): Promise<PlanName[]> {
  return queryRows(
    sql.select_required_plans_for_course_instance,
    { course_instance_id },
    z.enum(PLAN_NAMES)
  );
}

export async function updateRequiredPlansForCourseInstance(
  course_instance_id: string,
  plans: PlanName[]
) {
  await queryAsync(sql.update_required_plans_for_course_instance, { course_instance_id, plans });
}

export async function updatePlanGrantsForInstitution(
  institution_id: string,
  plans: PlanGrantUpdate[]
) {
  await queryAsync(sql.update_plan_grants_for_institution, {
    institution_id,
    plans: JSON.stringify(plans),
  });
}
