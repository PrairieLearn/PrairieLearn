import { Router } from 'express';
import type Stripe from 'stripe';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { runInTransactionAsync } from '@prairielearn/postgres';
import { assertNever } from '@prairielearn/utils';

import { EnrollmentPage } from '../../../components/EnrollmentPage.js';
import { config } from '../../../lib/config.js';
import {
  CourseInstanceSchema,
  CourseSchema,
  InstitutionSchema,
  UserSchema,
} from '../../../lib/db-types.js';
import {
  type EnrollmentAccessDecision,
  admitUserFromLti13Launch,
  selectEnrollmentAccessDecision,
} from '../../../lib/enrollment/admission.js';
import {
  type EnrollmentIneligibilityReason,
  getEligibilityErrorMessage,
} from '../../../lib/enrollment/eligibility.js';
import { selectEnrollmentAdmissionDecision } from '../../../lib/enrollment/identity.js';
import { EnrollmentAdmissionDeniedError } from '../../../lib/enrollment/reconciliation.js';
import { idsEqual } from '../../../lib/id.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../../lib/res-locals.js';
import { getCanonicalHost } from '../../../lib/url.js';
import { checkPlanGrantsForLocals } from '../../lib/billing/plan-grants.js';
import {
  getMissingPlanGrants,
  getPlanGrantsForPartialContexts,
  getRequiredPlansForCourseInstance,
} from '../../lib/billing/plans.js';
import {
  getOrCreateStripeCustomerId,
  getPriceForPlan,
  getPricesForPlans,
  getStripeClient,
} from '../../lib/billing/stripe.js';
import {
  type Lti13CourseInstanceUpgradeAuthorization,
  clearLti13CourseInstanceUpgradeAuthorization,
  getLti13CourseInstanceUpgradeAuthorization,
} from '../../lib/lti13-course-instance-upgrade.js';
import { ensurePlanGrant } from '../../models/plan-grants.js';
import {
  getStripeCheckoutSessionByStripeObjectId,
  insertStripeCheckoutSessionForUserInCourseInstance,
  markStripeCheckoutSessionCompleted,
  updateStripeCheckoutSessionData,
} from '../../models/stripe-checkout-sessions.js';

import {
  CourseInstanceStudentUpdateSuccess,
  Lti13CourseInstanceRelaunch,
  StudentCourseInstanceUpgrade,
} from './studentCourseInstanceUpgrade.html.js';

const router = Router({ mergeParams: true });

/**
 * Determines whether the student may buy a plan required by this course.
 * Joined students may need another plan, and an enrollment code is checked
 * when enrollment resumes rather than before payment.
 *
 * A student sent here from an LTI launch may also bypass self-enrollment
 * restrictions. The session and pending invitation are checked before this
 * function is called, and a blocked enrollment still takes precedence.
 */
function getAdmissionIneligibilityReason(
  decision: EnrollmentAccessDecision,
  hasLti13Invitation: boolean,
): EnrollmentIneligibilityReason | null {
  if (decision.allowed) return null;
  switch (decision.reason) {
    case 'already_joined':
    case 'enrollment_code_required':
      return null;
    case 'blocked':
      return decision.reason;
    case 'institution-restriction':
    case 'self-enrollment-disabled':
    case 'self-enrollment-expired':
      return hasLti13Invitation ? null : decision.reason;
    default:
      return assertNever(decision.reason);
  }
}

/**
 * `lti13_relaunch=1` tells us to look for an LTI invitation saved before the
 * upgrade redirect. The session must contain an invitation for this user and
 * course, and it must still be pending for the same LTI link and `sub`.
 */
async function selectLti13UpgradeAuthorization(
  queryValue: unknown,
  session: Record<string, unknown>,
  resLocals: ResLocalsForPage<'course-instance'>,
): Promise<Lti13CourseInstanceUpgradeAuthorization | null> {
  if (
    queryValue !== '1' ||
    !idsEqual(resLocals.user.id, resLocals.authn_user.id) ||
    resLocals.authz_data.authn_course_role !== 'None' ||
    resLocals.authz_data.authn_course_instance_role !== 'None' ||
    !resLocals.authz_data.authn_has_student_access ||
    resLocals.is_administrator
  ) {
    return null;
  }

  const authorization = getLti13CourseInstanceUpgradeAuthorization({
    courseInstanceId: resLocals.course_instance.id,
    now: resLocals.req_date,
    session,
    userId: resLocals.authn_user.id,
  });
  if (authorization === null) return null;

  const decision = await selectEnrollmentAdmissionDecision({
    courseInstanceId: resLocals.course_instance.id,
    source: {
      type: 'invitation',
      matchedBy: 'lti13',
      lti13CourseInstanceId: authorization.lti13_course_instance_id,
      sub: authorization.sub,
    },
    userId: resLocals.authn_user.id,
  });
  if (
    !decision.allowed ||
    decision.invitationCandidate === null ||
    !idsEqual(decision.invitationCandidate.enrollment.id, authorization.enrollment_id)
  ) {
    clearLti13CourseInstanceUpgradeAuthorization(session);
    return null;
  }
  return authorization;
}

async function finishLti13UpgradeAdmission({
  authorization,
  ip,
  isAdministrator,
  reqDate,
  session,
}: {
  authorization: Lti13CourseInstanceUpgradeAuthorization;
  ip: string | null;
  isAdministrator: boolean;
  reqDate: Date;
  session: Record<string, unknown>;
}): Promise<boolean> {
  try {
    await admitUserFromLti13Launch({
      courseInstanceId: authorization.course_instance_id,
      expectedInvitationEnrollmentId: authorization.enrollment_id,
      ip,
      isAdministrator,
      lti13CourseInstanceId: authorization.lti13_course_instance_id,
      reqDate,
      sub: authorization.sub,
      userId: authorization.user_id,
    });
  } catch (error) {
    if (!(error instanceof EnrollmentAdmissionDeniedError)) throw error;

    // The invitation can change while the student is at Stripe. A new LMS
    // launch supplies current LTI data and either admits the student or shows
    // the appropriate course access error.
    clearLti13CourseInstanceUpgradeAuthorization(session);
    return false;
  }

  clearLti13CourseInstanceUpgradeAuthorization(session);
  return true;
}

router.get(
  '/',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const courseInstance = CourseInstanceSchema.parse(res.locals.course_instance);
    const course = CourseSchema.parse(res.locals.course);
    const user = UserSchema.parse(res.locals.authn_user);
    const lti13UpgradeAuthorization = await selectLti13UpgradeAuthorization(
      req.query.lti13_relaunch,
      req.session,
      res.locals,
    );

    const admissionDecision = await selectEnrollmentAccessDecision({
      course,
      courseInstance,
      user,
    });
    const ineligibilityReason = getAdmissionIneligibilityReason(
      admissionDecision,
      lti13UpgradeAuthorization !== null,
    );
    if (ineligibilityReason !== null) {
      res.status(403).send(EnrollmentPage({ reason: ineligibilityReason, resLocals: res.locals }));
      return;
    }

    // If the required plan was granted while this page was open, finish the
    // admission without sending the student through the LMS again.
    const hasPlanGrants = await checkPlanGrantsForLocals(res.locals);
    if (hasPlanGrants) {
      if (lti13UpgradeAuthorization !== null) {
        const admitted = await finishLti13UpgradeAdmission({
          authorization: lti13UpgradeAuthorization,
          ip: req.ip ?? null,
          isAdministrator: res.locals.is_administrator,
          reqDate: res.locals.req_date,
          session: req.session,
        });
        if (admitted) {
          res.redirect(`/pl/course_instance/${courseInstance.id}/`);
          return;
        }

        res.send(Lti13CourseInstanceRelaunch({ course, courseInstance, resLocals: res.locals }));
        return;
      }

      res.redirect(`/pl/course_instance/${res.locals.course_instance.id}/assessments`);
      return;
    }

    const institution = InstitutionSchema.parse(res.locals.institution);

    const planGrants = await getPlanGrantsForPartialContexts({
      institution_id: institution.id,
      course_instance_id: courseInstance.id,
      user_id: user.id,
    });
    const requiredPlans = await getRequiredPlansForCourseInstance(res.locals.course_instance.id);
    const missingPlans = getMissingPlanGrants(planGrants, requiredPlans);

    // Prices may be cached; if they are not, they will be fetched from Stripe.
    const planPrices = config.stripeSecretKey ? await getPricesForPlans(missingPlans) : null;

    res.send(
      StudentCourseInstanceUpgrade({
        course,
        courseInstance,
        lti13AdmissionPending: lti13UpgradeAuthorization !== null,
        missingPlans,
        planPrices,
        resLocals: res.locals,
      }),
    );
  }),
);

const UpgradeBodySchema = z.object({
  terms_agreement: z.literal('1').optional(),
  unsafe_plan_names: z.union([z.string(), z.array(z.string())]).transform((val) => {
    return Array.isArray(val) ? val : [val];
  }),
});

// Only a subset of all plans are allowed to be paid for on this page.
const PlanNamesSchema = z.array(z.enum(['basic', 'compute']));

router.post(
  '/',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    if (req.body.__action === 'upgrade') {
      const institution = InstitutionSchema.parse(res.locals.institution);
      const course = CourseSchema.parse(res.locals.course);
      const courseInstance = CourseInstanceSchema.parse(res.locals.course_instance);
      const user = UserSchema.parse(res.locals.authn_user);
      const lti13UpgradeAuthorization = await selectLti13UpgradeAuthorization(
        req.body.lti13_relaunch,
        req.session,
        res.locals,
      );

      // Recheck admission eligibility before creating the Stripe checkout session.
      const admissionDecision = await selectEnrollmentAccessDecision({
        course,
        courseInstance,
        user,
      });
      const ineligibilityReason = getAdmissionIneligibilityReason(
        admissionDecision,
        lti13UpgradeAuthorization !== null,
      );
      if (ineligibilityReason !== null) {
        throw new error.HttpStatusError(403, getEligibilityErrorMessage(ineligibilityReason));
      }

      const body = UpgradeBodySchema.parse(req.body);

      if (!body.terms_agreement) {
        throw new error.HttpStatusError(400, 'You must agree to the terms and conditions.');
      }

      const planNames = PlanNamesSchema.parse(body.unsafe_plan_names);

      const lineItems: NonNullable<
        Parameters<Stripe['checkout']['sessions']['create']>[0]
      >['line_items'] = [];

      if (planNames.includes('basic')) {
        const price = await getPriceForPlan('basic');
        lineItems.push({
          price: price.id,
          quantity: 1,
        });
      }

      if (planNames.includes('compute')) {
        const price = await getPriceForPlan('compute');
        lineItems.push({
          price: price.id,
          quantity: 1,
        });
      }

      // Validate that the plan names from the client are actually valid. We
      // consider them to be valid if they are in the list of missing plans,
      // which in turn is defined as a plan that is required for the current
      // course instance and isn't already granted to the user.
      const planGrants = await getPlanGrantsForPartialContexts({
        institution_id: institution.id,
        course_instance_id: courseInstance.id,
        user_id: user.id,
      });
      const requiredPlans = await getRequiredPlansForCourseInstance(courseInstance.id);
      const missingPlans = getMissingPlanGrants(planGrants, requiredPlans);
      if (!planNames.every((planName) => missingPlans.includes(planName))) {
        throw new error.HttpStatusError(400, 'Invalid plan selection.');
      }

      const host = getCanonicalHost(req);
      const urlBase = `${host}/pl/course_instance/${courseInstance.id}/upgrade`;
      const lti13RelaunchQuery = lti13UpgradeAuthorization !== null ? '&lti13_relaunch=1' : '';

      const stripe = getStripeClient();
      const customerId = await getOrCreateStripeCustomerId(user.id, {
        name: user.name,
      });
      const metadata = {
        prairielearn_institution_id: institution.id,
        prairielearn_institution_name: `${institution.long_name} (${institution.short_name})`,
        prairielearn_course_id: course.id,
        prairielearn_course_name: `${course.short_name}: ${course.title}`,
        prairielearn_course_instance_id: courseInstance.id,
        prairielearn_course_instance_name: `${courseInstance.long_name} (${courseInstance.short_name})`,
        prairielearn_user_id: user.id,
      };
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_update: {
          name: 'auto',
          address: 'auto',
        },
        line_items: lineItems,
        mode: 'payment',
        success_url: `${urlBase}/success?session_id={CHECKOUT_SESSION_ID}${lti13RelaunchQuery}`,
        cancel_url: `${urlBase}${lti13UpgradeAuthorization !== null ? '?lti13_relaunch=1' : ''}`,
        metadata,
        payment_intent_data: {
          metadata,
        },
      });

      await insertStripeCheckoutSessionForUserInCourseInstance({
        agent_user_id: user.id,
        stripe_object_id: session.id,
        course_instance_id: courseInstance.id,
        subject_user_id: user.id,
        data: session,
        plan_names: planNames,
      });

      if (!session.url) throw new error.HttpStatusError(500, 'Stripe session URL not found');

      res.redirect(session.url);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/success',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const institution = InstitutionSchema.parse(res.locals.institution);
    const course = CourseSchema.parse(res.locals.course);
    const courseInstance = CourseInstanceSchema.parse(res.locals.course_instance);
    const authn_user = UserSchema.parse(res.locals.authn_user);
    const lti13UpgradeRequested = req.query.lti13_relaunch === '1';

    if (!req.query.session_id) throw new error.HttpStatusError(400, 'Missing session_id');

    const stripeSessionId = z.string().parse(req.query.session_id);

    const localSession = await getStripeCheckoutSessionByStripeObjectId(stripeSessionId);
    if (!localSession) {
      throw new Error(`Unknown Stripe session: ${stripeSessionId}`);
    }
    // Verify that the session is associated with the current course instance
    // and user. We shouldn't hit this during normal operations, but an attacker
    // could try to replay a session ID from a different course instance or user.
    if (
      localSession.course_instance_id !== courseInstance.id ||
      localSession.agent_user_id !== res.locals.authn_user.id
    ) {
      throw new error.HttpStatusError(400, 'Invalid session');
    }

    const finishLti13Admission = async () => {
      const authorization = await selectLti13UpgradeAuthorization(
        req.query.lti13_relaunch,
        req.session,
        res.locals,
      );
      if (authorization === null) return false;

      return await finishLti13UpgradeAdmission({
        authorization,
        ip: req.ip ?? null,
        isAdministrator: res.locals.is_administrator,
        reqDate: res.locals.req_date,
        session: req.session,
      });
    };

    if (localSession.completed_at) {
      if (await finishLti13Admission()) {
        res.redirect(`/pl/course_instance/${courseInstance.id}/`);
        return;
      }

      // We already processed this session; just show them the success page.
      res.send(
        CourseInstanceStudentUpdateSuccess({
          course,
          courseInstance,
          requireLti13Relaunch: lti13UpgradeRequested,
          paid: true,
          resLocals: res.locals,
        }),
      );
      return;
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

    if (session.payment_status === 'paid') {
      if (!localSession.plan_grants_created) {
        // Create plan grants and mark the session as completed.
        //
        // Doing these mutations in a GET handler isn't great, but we have
        // reasonable protection in place against replay attacks, and it would
        // be difficult to perform a CSRF attack because the session must have
        // been created in Stripe and must refer to the same user and course instance.
        await runInTransactionAsync(async () => {
          for (const planName of localSession.plan_names) {
            await ensurePlanGrant({
              plan_grant: {
                plan_name: planName,
                type: 'stripe',
                institution_id: institution.id,
                course_instance_id: courseInstance.id,
                user_id: authn_user.id,
              },
              authn_user_id: authn_user.id,
            });
          }

          await updateStripeCheckoutSessionData({
            stripe_object_id: stripeSessionId,
            data: session,
          });
          await markStripeCheckoutSessionCompleted(session.id);
        });
      }

      if (await finishLti13Admission()) {
        res.redirect(`/pl/course_instance/${courseInstance.id}/`);
        return;
      }

      res.send(
        CourseInstanceStudentUpdateSuccess({
          course,
          courseInstance,
          requireLti13Relaunch: lti13UpgradeRequested,
          paid: true,
          resLocals: res.locals,
        }),
      );
    } else {
      // The user paid with an asynchronous payment method (e.g. ACH), so we
      // can't immediately grant them any plans. Instead, we'll show a thanks
      // page and let them know that their plans will be granted once the
      // payment is complete.
      //
      // We don't expect to hit this case, since we're only offering credit
      // card payments at the moment, but this at least allows us to behave
      // sensibly if something goes very wrong.
      res.send(
        CourseInstanceStudentUpdateSuccess({
          course,
          courseInstance,
          requireLti13Relaunch: false,
          paid: false,
          resLocals: res.locals,
        }),
      );
    }
  }),
);

export default router;
