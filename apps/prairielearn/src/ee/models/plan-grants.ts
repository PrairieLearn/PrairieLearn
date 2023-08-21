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
type NewCourseInstanceUserPlanGrant = WithRequiredKeys<
  NewBasePlanGrant,
  'institution_id' | 'course_instance_id' | 'user_id'
>;
type NewUserPlanGrant = WithRequiredKeys<NewBasePlanGrant, 'user_id'>;

type NewPlanGrant =
  | NewInstitutionPlanGrant
  | NewCourseInstancePlanGrant
  | NewCourseInstanceUserPlanGrant
  | NewUserPlanGrant;

export async function ensurePlanGrant({
  plan_grant,
  authn_user_id,
}: {
  plan_grant: NewPlanGrant;
  authn_user_id: string;
}): Promise<void> {
  const newPlanGrant = await queryRow(
    sql.ensure_plan_grant,
    {
      type: plan_grant.type,
      plan_name: plan_grant.plan_name,
      institution_id: plan_grant.institution_id ?? null,
      course_instance_id: plan_grant.course_instance_id ?? null,
      user_id: plan_grant.user_id ?? null,
    },
    PlanGrantSchema,
  );
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

export async function updatePlanGrant({
  plan_grant,
  type,
  authn_user_id,
}: {
  plan_grant: PlanGrant;
  type: EnumPlanGrantType;
  authn_user_id: string;
}): Promise<void> {
  const updatedPlanGrant = await queryRow(
    sql.update_plan_grant,
    { id: plan_grant.id, type },
    PlanGrantSchema,
  );
  await insertAuditLog({
    authn_user_id,
    table_name: 'plan_grants',
    action: 'update',
    column_name: 'type',
    institution_id: updatedPlanGrant.institution_id,
    course_instance_id: updatedPlanGrant.course_instance_id,
    user_id: updatedPlanGrant.user_id,
    old_state: plan_grant,
    new_state: updatedPlanGrant,
    row_id: updatedPlanGrant.id,
  });
}

export async function deletePlanGrant({
  plan_grant,
  authn_user_id,
}: {
  plan_grant: PlanGrant;
  authn_user_id: string;
}): Promise<void> {
  const deletedPlanGrant = await queryRow(
    sql.delete_plan_grant,
    { id: plan_grant.id },
    PlanGrantSchema,
  );
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
