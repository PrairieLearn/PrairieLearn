import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { insertAuditLog } from '../../models/audit-log';
import { PlanGrant, PlanGrantSchema, EnumPlanGrantType } from '../../lib/db-types';
import { WithRequiredKeys } from '../../lib/types';

const sql = loadSqlEquiv(__filename);

type NewBasePlanGrant = Omit<PlanGrant, 'created_at' | 'id'>;
type NewInstitutionPlanGrant = WithRequiredKeys<NewBasePlanGrant, 'institution_id'>;
type NewCourseInstancePlanGrant = WithRequiredKeys<
  NewBasePlanGrant,
  'institution_id' | 'course_instance_id'
>;
type NewEnrollmentPlanGrant = WithRequiredKeys<
  NewBasePlanGrant,
  'institution_id' | 'course_instance_id' | 'enrollment_id'
>;
type NewUserPlanGrant = WithRequiredKeys<NewBasePlanGrant, 'user_id'>;

type NewPlanGrant =
  | NewInstitutionPlanGrant
  | NewCourseInstancePlanGrant
  | NewEnrollmentPlanGrant
  | NewUserPlanGrant;

export async function insertPlanGrant(
  planGrant: NewPlanGrant,
  authn_user_id: string,
): Promise<void> {
  planGrant.institution_id;
  const newPlanGrant = await queryRow(
    sql.insert_plan_grant,
    {
      type: planGrant.type,
      plan_name: planGrant.plan_name,
      institution_id: planGrant.institution_id ?? null,
      course_instance_id: planGrant.course_instance_id ?? null,
      enrollment_id: planGrant.enrollment_id ?? null,
      user_id: planGrant.user_id ?? null,
    },
    PlanGrantSchema,
  );
  // TODO: this doesn't yet associate plan grants with enrollments.
  await insertAuditLog({
    authn_user_id,
    table_name: 'plan_grants',
    action: 'insert',
    institution_id: newPlanGrant.institution_id,
    course_instance_id: newPlanGrant.course_instance_id,
    user_id: newPlanGrant.user_id,
    new_state: newPlanGrant,
    row_id: newPlanGrant.id,
  });
}

export async function updatePlanGrant(
  planGrant: PlanGrant,
  type: EnumPlanGrantType,
  authn_user_id: string,
): Promise<void> {
  const updatedPlanGrant = await queryRow(
    sql.update_plan_grant,
    { id: planGrant.id, type },
    PlanGrantSchema,
  );
  // TODO: this doesn't yet associate plan grants with enrollments.
  await insertAuditLog({
    authn_user_id,
    table_name: 'plan_grants',
    action: 'update',
    column_name: 'type',
    institution_id: updatedPlanGrant.institution_id,
    course_instance_id: updatedPlanGrant.course_instance_id,
    user_id: updatedPlanGrant.user_id,
    old_state: planGrant,
    new_state: updatedPlanGrant,
    row_id: updatedPlanGrant.id,
  });
}

export async function deletePlanGrant(planGrant: PlanGrant, authn_user_id: string): Promise<void> {
  const deletedPlanGrant = await queryRow(
    sql.delete_plan_grant,
    { id: planGrant.id },
    PlanGrantSchema,
  );
  // TODO: this doesn't yet associate plan grants with enrollments.
  await insertAuditLog({
    authn_user_id,
    table_name: 'plan_grants',
    action: 'delete',
    institution_id: deletedPlanGrant.institution_id,
    course_instance_id: deletedPlanGrant.course_instance_id,
    user_id: deletedPlanGrant.user_id,
    old_state: deletedPlanGrant,
    row_id: deletedPlanGrant.id,
  });
}
