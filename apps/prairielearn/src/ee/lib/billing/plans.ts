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
type CourseInstanceUserPlanGrantContext = WithRequiredKeys<
  BasePlanGrantContext,
  'institution_id' | 'course_instance_id' | 'user_id'
>;
type UserPlanGrantContext = WithRequiredKeys<BasePlanGrantContext, 'user_id'>;
type PlanGrantContext =
  | InstitutionPlanGrantContext
  | CourseInstancePlanGrantContext
  | CourseInstanceUserPlanGrantContext
  | UserPlanGrantContext;
type RecursivePlanGrantContext = PlanGrantContext | BasePlanGrantContext;

/**
 * Returns the plan grants that apply directly to the given context. For
 * example, consider a course instance with a plan grant `foo` and a parent
 * institution with a plan grant `bar`. If we call this function with the
 * course instance's context, it will return only the `foo` plan grant.
 * If we call this function with the institution's context, it will return
 * only the `bar` plan grant.
 *
 * To get *all* plan grants that apply to a context, use
 * {@link getPlanGrantsForContextRecursive}.
 */
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

/**
 * Returns the plan grants that apply to the given context, including those
 * that belong to a parent entity. For example, consider a course instance
 * with a plan grant for `foo` and a parent institution with a plan grant for
 * `bar`. If we call this function with the course instance's context, it will
 * return both the `foo` and `bar` plan grants. If we call this function with
 * the institution's context, it will return only the `bar` plan grant.
 *
 * To get only the plan grants that apply directly to a context, use
 * {@link getPlanGrantsForContext}.
 */
export async function getPlanGrantsForContextRecursive(
  context: RecursivePlanGrantContext,
): Promise<PlanGrant[]> {
  return await queryRows(
    sql.select_plan_grants_for_context_recursive,
    {
      institution_id: context.institution_id ?? null,
      course_instance_id: context.course_instance_id ?? null,
      enrollment_id: context.enrollment_id ?? null,
      user_id: context.user_id ?? null,
    },
    PlanGrantSchema,
  );
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
    const existingPlanGrants = await getPlanGrantsForContext({ institution_id });
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

export async function reconcilePlanGrantsForEnrollment(
  context: EnrollmentPlanGrantContext,
  plans: DesiredPlan[],
  authn_user_id: string,
) {
  // TODO: Associating plan grants with enrollments might be problematic. If a
  // user enrolls in a course, pays for access, then un-enrolls, then re-enrolls,
  // we'll have lost the `plan_grants` row that tells us that this user paid.
  // Perhaps instead of associating a plan grant with an enrollment directly, we
  // can associate it with a (course_instance_id, user_id) pair? The DB schema
  // already supports this.
  await runInTransactionAsync(async () => {
    const existingPlanGrants = await getPlanGrantsForContext(context);
    await reconcilePlanGrants(context, existingPlanGrants, plans, authn_user_id);
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
