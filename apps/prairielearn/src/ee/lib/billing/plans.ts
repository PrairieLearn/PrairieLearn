import { z } from 'zod';
import {
  loadSqlEquiv,
  queryAsync,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import {
  EnumPlanGrantType,
  Institution,
  InstitutionSchema,
  PlanGrant,
  PlanGrantSchema,
} from '../../../lib/db-types';
import { PLAN_NAMES, PlanName } from './plans-types';
import { insertPlanGrant, updatePlanGrant, deletePlanGrant } from '../../models/plan-grants';

const sql = loadSqlEquiv(__filename);

export interface PlanGrantUpdate {
  plan: PlanName;
  grantType: EnumPlanGrantType;
}

type InstitutionPlanGrantContext = Pick<PlanGrant, 'institution_id'>;
type CourseInstancePlanGrantContext = Pick<PlanGrant, 'institution_id' | 'course_instance_id'>;
type EnrollmentPlanGrantContext = Pick<
  PlanGrant,
  'institution_id' | 'course_instance_id' | 'enrollment_id'
>;
type UserPlanGrantContext = Pick<PlanGrant, 'user_id'>;
type PlanGrantContext =
  | InstitutionPlanGrantContext
  | CourseInstancePlanGrantContext
  | EnrollmentPlanGrantContext
  | UserPlanGrantContext;

export async function getPlanGrantsForInstitution(institution_id: string): Promise<PlanGrant[]> {
  return queryRows(sql.select_plan_grants_for_institution, { institution_id }, PlanGrantSchema);
}

export async function getPlanGrantsForCourseInstance(
  course_instance_id: string,
): Promise<PlanGrant[]> {
  return queryRows(
    sql.select_plan_grants_for_course_instance,
    { course_instance_id },
    PlanGrantSchema,
  );
}

export async function getRequiredPlansForCourseInstance(
  course_instance_id: string,
): Promise<PlanName[]> {
  return queryRows(
    sql.select_required_plans_for_course_instance,
    { course_instance_id },
    z.enum(PLAN_NAMES),
  );
}

export async function updateRequiredPlansForCourseInstance(
  course_instance_id: string,
  plans: PlanName[],
) {
  await queryAsync(sql.update_required_plans_for_course_instance, { course_instance_id, plans });
}

export async function updatePlanGrantsForInstitution(
  institution_id: string,
  plans: PlanGrantUpdate[],
) {
  await runInTransactionAsync(async () => {
    // TODO: address race condition with locking?
    const existingPlanGrants = await getPlanGrantsForInstitution(institution_id);
    await updatePlanGrants({ institution_id }, existingPlanGrants, plans);
  });
}

export async function updatePlanGrantsForCourseInstance(
  course_instance_id: string,
  plans: PlanGrantUpdate[],
) {
  await runInTransactionAsync(async () => {
    // TODO: address race condition with locking?
    const institution = await getInstitutionForCourseInstance(course_instance_id);
    const existingPlanGrants = await getPlanGrantsForCourseInstance(course_instance_id);
    await updatePlanGrants(
      {
        institution_id: institution.id,
        course_instance_id,
      },
      existingPlanGrants,
      plans,
    );
  });
}

async function updatePlanGrants(
  context: PlanGrantContext,
  existingPlanGrants: PlanGrant[],
  plans: PlanGrantUpdate[],
) {
  const newPlans = plans.filter(
    (plan) => !existingPlanGrants.find((p) => p.plan_name === plan.plan),
  );
  const updatedPlanGrants = existingPlanGrants.map((planGrant) => ({
    planGrant,
    newType: plans.find((p) => p.plan === planGrant.plan_name)?.grantType,
  }));
  const deletedPlanGrants = existingPlanGrants.filter(
    (plan) => !plans.find((p) => p.plan === plan.plan_name),
  );

  for (const plan of newPlans) {
    await insertPlanGrant({
      ...context,
      plan_name: plan.plan,
      type: plan.grantType,
    });
  }

  for (const planGrant of updatedPlanGrants) {
    if (!planGrant.newType || planGrant.newType === planGrant.planGrant.type) {
      continue;
    }

    await updatePlanGrant(planGrant.planGrant, planGrant.newType);
  }

  for (const planGrant of deletedPlanGrants) {
    await deletePlanGrant(planGrant);
  }
}

async function getInstitutionForCourseInstance(course_instance_id: string): Promise<Institution> {
  return queryRow(
    sql.select_institution_for_course_instance,
    { course_instance_id },
    InstitutionSchema,
  );
}
