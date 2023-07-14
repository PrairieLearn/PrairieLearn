import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { PlanName } from '../lib/billing/plans-types';
import { CourseInstanceRequiredPlanSchema } from '../../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function insertCourseInstanceRequiredPlan(course_instance_id: string, plan: PlanName) {
  const newRequiredPlan = await queryRow(
    sql.insert_required_plan_for_course_instance,
    { course_instance_id, plan_name: plan },
    CourseInstanceRequiredPlanSchema,
  );
  // TODO: audit events
  return newRequiredPlan;
}

export async function deleteCourseInstanceRequiredPlan(course_instance_id: string, plan: PlanName) {
  const deletedRequiredPlan = await queryRow(
    sql.delete_required_plan_for_course_instance,
    {
      course_instance_id,
      plan_name: plan,
    },
    CourseInstanceRequiredPlanSchema,
  );
  // TODO: audit events
  return deletedRequiredPlan;
}
