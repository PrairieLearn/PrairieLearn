import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import error = require('@prairielearn/error');
import { flash } from '@prairielearn/flash';

import { StudentCourseInstanceUpgrade } from './studentCourseInstanceUpgrade.html';
import { checkPlanGrants } from '../../lib/billing/plan-grants';
import {
  getMissingPlanGrants,
  getPlanGrantsForPartialContexts,
  getRequiredPlansForCourseInstance,
} from '../../lib/billing/plans';
import { insertPlanGrant } from '../../models/plan-grants';
import {
  CourseInstanceSchema,
  CourseSchema,
  InstitutionSchema,
  UserSchema,
} from '../../../lib/db-types';
import { getOrCreateStripeCustomerId, getStripeClient } from '../../lib/billing/stripe';
import { config } from '../../../lib/config';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Check if the student is *actually* missing plan grants, or if they just
    // came across this URL on accident. If they have all the necessary plan grants,
    // redirect them back to the assessments page.
    const hasPlanGrants = await checkPlanGrants(res);
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

    // TODO: fetch pricing information from Stripe API; cache it too.

    res.send(
      StudentCourseInstanceUpgrade({
        course,
        course_instance,
        missingPlans,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'upgrade') {
      console.log(res.locals);
      const institution = InstitutionSchema.parse(res.locals.institution);
      const course = CourseSchema.parse(res.locals.course);
      const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);
      const user = UserSchema.parse(res.locals.authn_user);

      if (!req.body.terms_agreement) {
        throw error.make(400, 'You must agree to the terms and conditions.');
      }

      const protocol = req.protocol;
      const host = req.get('host');
      const urlBase = `${protocol}://${host}/pl/course_instance/${course_instance.id}/upgrade`;

      const stripe = getStripeClient();
      const customerId = await getOrCreateStripeCustomerId(user.user_id, {
        name: user.name,
      });
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_update: {
          name: 'auto',
        },
        metadata: {
          prairielearn_institution_id: institution.id,
          prairielearn_institution_name: `${institution.long_name} (${institution.short_name})`,
          prairielearn_course_id: course.id,
          prairielearn_course_name: `${course.short_name}: ${course.title}`,
          prairielearn_course_instance_id: course_instance.id,
          prairielearn_course_instance_name: `${course_instance.long_name} (${course_instance.short_name})`,
          prairielearn_user_id: user.user_id,
        },
        // TODO: have client send back list of plans; validate list.
        //
        // TODO: should we use lookup keys instead? See
        // https://stripe.com/docs/products-prices/manage-prices#lookup-keys
        // Unfortunately, these can't be set or modified from the Stripe console,
        // so they aren't as useful as they could be.
        line_items: [
          {
            price: config.stripePriceIds.basic,
            quantity: 1,
          },
          {
            price: config.stripePriceIds.compute,
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${urlBase}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: urlBase,
      });

      // TODO: persist session ID to database so we can retrieve it later.

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
    // TODO: mutation in GET handler? Is there some token we should check?
    const institution = InstitutionSchema.parse(res.locals.institution);
    const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);

    if (!req.query.session_id) throw error.make(400, 'Missing session_id');

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id as string);
    console.log(session);

    if (session.payment_status === 'paid') {
      // TODO: handle duplicate plan grant creation?
      await insertPlanGrant({
        plan_grant: {
          plan_name: 'basic',
          type: 'stripe',
          institution_id: institution.id,
          course_instance_id: course_instance.id,
          user_id: res.locals.authn_user.id,
        },
        authn_user_id: res.locals.authn_user.id,
      });
      await insertPlanGrant({
        plan_grant: {
          plan_name: 'compute',
          type: 'stripe',
          institution_id: institution.id,
          course_instance_id: course_instance.id,
          user_id: res.locals.authn_user.id,
        },
        authn_user_id: res.locals.authn_user.id,
      });

      flash('success', 'Your account has been upgraded!');
    } else {
      // TODO: handle async payments?
    }

    // TODO: show actual success page.
    res.send('Success!');
  }),
);

router.get('/cancel', (req, res) => {
  res.send('Canceled!');
});

export default router;
