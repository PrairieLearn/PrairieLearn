import { z } from 'zod';
import { loadSqlEquiv, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';
import {
  EnumPlanGrantType,
  Institution,
  InstitutionSchema,
  PlanGrant,
  PlanGrantSchema,
} from '../../../lib/db-types';
import { PLAN_NAMES, PlanName } from './plans-types';
import { insertPlanGrant, updatePlanGrant, deletePlanGrant } from '../../models/plan-grants';
import {
  insertCourseInstanceRequiredPlan,
  deleteCourseInstanceRequiredPlan,
} from '../../models/course-instance-required-plans';
import { WithRequiredKeys } from '../../../lib/types';

const sql = loadSqlEquiv(__filename);

export interface DesiredPlan {
  plan: PlanName;
  grantType: EnumPlanGrantType;
}

type BasePlanGrantContext = Omit<PlanGrant, 'created_at' | 'id' | 'plan_name' | 'type'>;
type InstitutionPlanGrantContext = WithRequiredKeys<BasePlanGrantContext, 'institution_id'>;
type CourseInstancePlanGrantContext = WithRequiredKeys<
  BasePlanGrantContext,
  'institution_id' | 'course_instance_id'
>;
type EnrollmentPlanGrantContext = WithRequiredKeys<
  BasePlanGrantContext,
  'institution_id' | 'course_instance_id' | 'enrollment_id'
>;
type UserPlanGrantContext = WithRequiredKeys<BasePlanGrantContext, 'user_id'>;
type PlanGrantContext =
  | InstitutionPlanGrantContext
  | CourseInstancePlanGrantContext
  | EnrollmentPlanGrantContext
  | UserPlanGrantContext;

export async function getPlanGrantsForInstitution(institution_id: string): Promise<PlanGrant[]> {
  return await getPlanGrantsForContext({ institution_id });
}

export async function getPlanGrantsForCourseInstance({
  institution_id,
  course_instance_id,
}: {
  institution_id: string;
  course_instance_id: string;
}): Promise<PlanGrant[]> {
  return await getPlanGrantsForContext({ institution_id, course_instance_id });
}

export async function getPlanGrantsForContext(context: PlanGrantContext): Promise<PlanGrant[]> {
  return await queryRows(
    sql.select_plan_grants_for_context,
    {
      institution_id: context.institution_id ?? null,
      course_instance_id: context.course_instance_id ?? null,
      enrollment_id: context.enrollment_id ?? null,
      user_id: context.user_id ?? null,
    },
    PlanGrantSchema,
  );
}

export function getPlanNamesFromPlanGrants(planGrants: PlanGrant[]): PlanName[] {
  const planNames = new Set<PlanName>();
  planGrants.forEach((planGrant) => planNames.add(planGrant.plan_name));
  return Array.from(planNames);
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
  authn_user_id: string,
) {
  await runInTransactionAsync(async () => {
    const existingRequiredPlans = await getRequiredPlansForCourseInstance(course_instance_id);
    const plansToAdd = plans.filter((plan) => !existingRequiredPlans.includes(plan));
    const plansToRemove = existingRequiredPlans.filter((plan) => !plans.includes(plan));

    for (const plan of plansToAdd) {
      await insertCourseInstanceRequiredPlan(course_instance_id, plan, authn_user_id);
    }

    for (const plan of plansToRemove) {
      await deleteCourseInstanceRequiredPlan(course_instance_id, plan, authn_user_id);
    }
  });
}

export async function reconcilePlanGrantsForInstitution(
  institution_id: string,
  plans: DesiredPlan[],
  authn_user_id: string,
) {
  await runInTransactionAsync(async () => {
    const existingPlanGrants = await getPlanGrantsForInstitution(institution_id);
    await reconcilePlanGrants({ institution_id }, existingPlanGrants, plans, authn_user_id);
  });
}

export async function reconcilePlanGrantsForCourseInstance(
  course_instance_id: string,
  plans: DesiredPlan[],
  authn_user_id: string,
) {
  await runInTransactionAsync(async () => {
    const institution = await getInstitutionForCourseInstance(course_instance_id);
    const existingPlanGrants = await getPlanGrantsForCourseInstance({
      institution_id: institution.id,
      course_instance_id,
    });
    await reconcilePlanGrants(
      {
        institution_id: institution.id,
        course_instance_id,
      },
      existingPlanGrants,
      plans,
      authn_user_id,
    );
  });
}

async function reconcilePlanGrants(
  context: PlanGrantContext,
  existingPlanGrants: PlanGrant[],
  desiredPlans: DesiredPlan[],
  authn_user_id: string,
) {
  const newPlans = desiredPlans.filter(
    (plan) => !existingPlanGrants.find((p) => p.plan_name === plan.plan),
  );
  const updatedPlanGrants = existingPlanGrants.map((planGrant) => ({
    planGrant,
    newType: desiredPlans.find((p) => p.plan === planGrant.plan_name)?.grantType,
  }));
  const deletedPlanGrants = existingPlanGrants.filter(
    (plan) => !desiredPlans.find((p) => p.plan === plan.plan_name),
  );

  for (const plan of newPlans) {
    await insertPlanGrant(
      {
        ...context,
        plan_name: plan.plan,
        type: plan.grantType,
      },
      authn_user_id,
    );
  }

  for (const planGrant of updatedPlanGrants) {
    if (!planGrant.newType || planGrant.newType === planGrant.planGrant.type) {
      continue;
    }

    await updatePlanGrant(planGrant.planGrant, planGrant.newType, authn_user_id);
  }

  for (const planGrant of deletedPlanGrants) {
    await deletePlanGrant(planGrant, authn_user_id);
  }
}

export function planGrantsSatisfyRequiredPlans(planGrants: PlanGrant[], requiredPlans: PlanName[]) {
  const planNames = getPlanNamesFromPlanGrants(planGrants);
  return requiredPlans.every((requiredPlan) => planNames.includes(requiredPlan));
}

async function getInstitutionForCourseInstance(course_instance_id: string): Promise<Institution> {
  return queryRow(
    sql.select_institution_for_course_instance,
    { course_instance_id },
    InstitutionSchema,
  );
}
