import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { insertAuditLog } from '../../models/audit-log';
import { PlanGrant, PlanGrantSchema, EnumPlanGrantType } from '../../lib/db-types';

const sql = loadSqlEquiv(__filename);

type NewBasePlanGrant = Omit<PlanGrant, 'created_at' | 'id'>;
type NewInstitutionPlanGrant = Omit<
  NewBasePlanGrant,
  'course_instance_id' | 'enrollment_id' | 'user_id'
>;
type NewCourseInstancePlanGrant = Omit<NewBasePlanGrant, 'enrollment_id' | 'user_id'>;
type NewEnrollmentPlanGrant = Omit<NewBasePlanGrant, 'user_id'>;
type NewUserPlanGrant = Omit<
  NewBasePlanGrant,
  'institution_id' | 'course_instance_id' | 'enrollment_id'
>;

type NewPlanGrant =
  | NewInstitutionPlanGrant
  | NewCourseInstancePlanGrant
  | NewEnrollmentPlanGrant
  | NewUserPlanGrant;

export async function insertPlanGrant(planGrant: NewPlanGrant): Promise<void> {
  const newPlanGrant = await queryRow(
    sql.insert_plan_grant,
    {
      institution_id: null,
      course_instance_id: null,
      enrollment_id: null,
      user_id: null,
      ...planGrant,
    },
    PlanGrantSchema,
  );
  // TODO: this doesn't yet associate plan grants with enrollments.
  await insertAuditLog({
    // TODO: pipe this down?
    authn_user_id: null,
    table_name: 'plan_grants',
    action: 'insert',
    institution_id: newPlanGrant.institution_id,
    course_instance_id: newPlanGrant.course_instance_id,
    // TODO: is this the correct usage of `user_id` here? Does this column
    // represent the user takin an action, or the user being affected by the
    // action?
    user_id: newPlanGrant.user_id,
    new_state: newPlanGrant,
    row_id: newPlanGrant.id,
  });
}

export async function updatePlanGrant(
  planGrant: PlanGrant,
  type: EnumPlanGrantType,
): Promise<void> {
  const updatedPlanGrant = await queryRow(
    sql.update_plan_grant,
    { id: planGrant.id, type },
    PlanGrantSchema,
  );
  // TODO: this doesn't yet associate plan grants with enrollments.
  await insertAuditLog({
    // TODO: pipe this down?
    authn_user_id: null,
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

export async function deletePlanGrant(planGrant: PlanGrant): Promise<void> {
  const deletedPlanGrant = await queryRow(
    sql.delete_plan_grant,
    { id: planGrant.id },
    PlanGrantSchema,
  );
  // TODO: this doesn't yet associate plan grants with enrollments.
  await insertAuditLog({
    // TODO: pipe this down?
    authn_user_id: null,
    table_name: 'plan_grants',
    action: 'delete',
    institution_id: deletedPlanGrant.institution_id,
    course_instance_id: deletedPlanGrant.course_instance_id,
    user_id: deletedPlanGrant.user_id,
    old_state: deletedPlanGrant,
    row_id: deletedPlanGrant.id,
  });
}
