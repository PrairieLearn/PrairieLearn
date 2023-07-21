import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { PlanName } from '../lib/billing/plans-types';
import { CourseInstanceRequiredPlanSchema, IdSchema } from '../../lib/db-types';
import { insertAuditLog } from '../../models/audit-log';

const sql = loadSqlEquiv(__filename);

const CourseInstanceRequiredPlanWithContextSchema = CourseInstanceRequiredPlanSchema.extend({
  course_id: IdSchema,
  institution_id: IdSchema,
});

export async function insertCourseInstanceRequiredPlan(
  course_instance_id: string,
  plan: PlanName,
  authn_user_id: string,
) {
  const newRequiredPlan = await queryRow(
    sql.insert_required_plan_for_course_instance,
    { course_instance_id, plan_name: plan },
    CourseInstanceRequiredPlanWithContextSchema,
  );
  await insertAuditLog({
    authn_user_id,
    table_name: 'course_instance_required_plans',
    action: 'insert',
    institution_id: newRequiredPlan.institution_id,
    course_id: newRequiredPlan.course_id,
    course_instance_id,
    new_state: newRequiredPlan,
    row_id: newRequiredPlan.id,
  });
  return newRequiredPlan;
}

export async function deleteCourseInstanceRequiredPlan(
  course_instance_id: string,
  plan: PlanName,
  authn_user_id: string,
) {
  const deletedRequiredPlan = await queryRow(
    sql.delete_required_plan_for_course_instance,
    {
      course_instance_id,
      plan_name: plan,
    },
    CourseInstanceRequiredPlanWithContextSchema,
  );
  await insertAuditLog({
    authn_user_id,
    table_name: 'course_instance_required_plans',
    action: 'delete',
    institution_id: deletedRequiredPlan.institution_id,
    course_id: deletedRequiredPlan.institution_id,
    course_instance_id,
    old_state: deletedRequiredPlan,
    row_id: deletedRequiredPlan.id,
  });
  return deletedRequiredPlan;
}
