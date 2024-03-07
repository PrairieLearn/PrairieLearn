import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import type Stripe from 'stripe';
import { z } from 'zod';
import * as error from '@prairielearn/error';
import { runInTransactionAsync } from '@prairielearn/postgres';

import {
  CourseInstanceStudentUpdateSuccess,
  StudentCourseInstanceUpgrade,
} from './studentCourseInstanceUpgrade.html';
import { checkPlanGrantsForLocals } from '../../lib/billing/plan-grants';
import {
  getMissingPlanGrants,
  getPlanGrantsForPartialContexts,
  getRequiredPlansForCourseInstance,
} from '../../lib/billing/plans';
import { ensurePlanGrant } from '../../models/plan-grants';
import {
  CourseInstanceSchema,
  CourseSchema,
  InstitutionSchema,
  UserSchema,
} from '../../../lib/db-types';
import {
  getOrCreateStripeCustomerId,
  getPriceForPlan,
  getPricesForPlans,
  getStripeClient,
} from '../../lib/billing/stripe';
import { config } from '../../../lib/config';
import {
  getStripeCheckoutSessionByStripeObjectId,
  insertStripeCheckoutSessionForUserInCourseInstance,
  markStripeCheckoutSessionCompleted,
  updateStripeCheckoutSessionData,
} from '../../models/stripe-checkout-sessions';
import { getCanonicalHost } from '../../../lib/url';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Check if the student is *actually* missing plan grants, or if they just
    // came across this URL on accident. If they have all the necessary plan grants,
    // redirect them back to the assessments page.
    const hasPlanGrants = await checkPlanGrantsForLocals(res.locals);
    if (hasPlanGrants) {
      res.redirect(`/pl/course_instance/${res.locals.course_instance.id}/assessments`);
      return;
    }

    const institution = InstitutionSchema.parse(res.locals.institution);
    const course = CourseSchema.parse(res.locals.course);
    const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);
    const user = UserSchema.parse(res.locals.authn_user);

    const planGrants = await getPlanGrantsForPartialContexts({
      institution_id: institution.id,
      course_instance_id: course_instance.id,
      user_id: user.user_id,
    });
    const requiredPlans = await getRequiredPlansForCourseInstance(res.locals.course_instance.id);
    const missingPlans = getMissingPlanGrants(planGrants, requiredPlans);

    // Prices may be cached; if they are not, they will be fetched from Stripe.
    const planPrices = config.stripeSecretKey ? await getPricesForPlans(missingPlans) : null;

    res.send(
      StudentCourseInstanceUpgrade({
        course,
        course_instance,
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
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'upgrade') {
      const institution = InstitutionSchema.parse(res.locals.institution);
      const course = CourseSchema.parse(res.locals.course);
      const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);
      const user = UserSchema.parse(res.locals.authn_user);

      const body = UpgradeBodySchema.parse(req.body);

      if (!body.terms_agreement) {
        throw error.make(400, 'You must agree to the terms and conditions.');
      }

      const planNames = PlanNamesSchema.parse(body.unsafe_plan_names);

      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

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
        course_instance_id: course_instance.id,
        user_id: user.user_id,
      });
      const requiredPlans = await getRequiredPlansForCourseInstance(res.locals.course_instance.id);
      const missingPlans = getMissingPlanGrants(planGrants, requiredPlans);
      if (!planNames.every((planName) => missingPlans.includes(planName))) {
        throw error.make(400, 'Invalid plan selection.');
      }

      const host = getCanonicalHost(req);
      const urlBase = `${host}/pl/course_instance/${course_instance.id}/upgrade`;

      const stripe = getStripeClient();
      const customerId = await getOrCreateStripeCustomerId(user.user_id, {
        name: user.name,
      });
      const metadata = {
        prairielearn_institution_id: institution.id,
        prairielearn_institution_name: `${institution.long_name} (${institution.short_name})`,
        prairielearn_course_id: course.id,
        prairielearn_course_name: `${course.short_name}: ${course.title}`,
        prairielearn_course_instance_id: course_instance.id,
        prairielearn_course_instance_name: `${course_instance.long_name} (${course_instance.short_name})`,
        prairielearn_user_id: user.user_id,
      };
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_update: {
          name: 'auto',
          address: 'auto',
        },
        line_items: lineItems,
        mode: 'payment',
        success_url: `${urlBase}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: urlBase,
        metadata,
        payment_intent_data: {
          metadata,
        },
      });

      await insertStripeCheckoutSessionForUserInCourseInstance({
        agent_user_id: user.user_id,
        stripe_object_id: session.id,
        institution_id: institution.id,
        course_instance_id: course_instance.id,
        subject_user_id: user.user_id,
        data: session,
        plan_names: planNames,
      });

      if (!session.url) throw error.make(500, 'Stripe session URL not found');

      res.redirect(session.url);
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/success',
  asyncHandler(async (req, res) => {
    const institution = InstitutionSchema.parse(res.locals.institution);
    const course = CourseSchema.parse(res.locals.course);
    const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);
    const authn_user = UserSchema.parse(res.locals.authn_user);

    if (!req.query.session_id) throw error.make(400, 'Missing session_id');

    const stripeSessionId = z.string().parse(req.query.session_id);

    const localSession = await getStripeCheckoutSessionByStripeObjectId(stripeSessionId);
    if (!localSession) {
      throw new Error(`Unknown Stripe session: ${stripeSessionId}`);
    }
    if (localSession.completed_at) {
      // We already processed this session; just show them the success page.
      res.send(
        CourseInstanceStudentUpdateSuccess({
          course,
          course_instance,
          paid: true,
          resLocals: res.locals,
        }),
      );
      return;
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

    // Verify that the session is associated with the current course instance
    // and user. We shouldn't hit this during normal operations, but an attacker
    // could try to replay a session ID from a different course instance or user.
    if (
      localSession.course_instance_id !== course_instance.id ||
      localSession.agent_user_id !== res.locals.authn_user.user_id
    ) {
      throw error.make(400, 'Invalid session');
    }

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
                course_instance_id: course_instance.id,
                user_id: authn_user.user_id,
              },
              authn_user_id: authn_user.user_id,
            });
          }

          await updateStripeCheckoutSessionData({
            stripe_object_id: stripeSessionId,
            data: session,
          });
          await markStripeCheckoutSessionCompleted(session.id);
        });
      }

      res.send(
        CourseInstanceStudentUpdateSuccess({
          course,
          course_instance,
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
          course_instance,
          paid: false,
          resLocals: res.locals,
        }),
      );
    }
  }),
);

export default router;
