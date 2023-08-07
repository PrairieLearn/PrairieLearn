import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import error = require('@prairielearn/error');
import { flash } from '@prairielearn/flash';

import { StudentCourseInstanceUpgrade } from './studentCourseInstanceUpgrade.html';
import { checkPlanGrants } from '../../lib/billing/plan-grants';
import { getRequiredPlansForCourseInstance } from '../../lib/billing/plans';
import { insertPlanGrant } from '../../models/plan-grants';
import { CourseInstanceSchema, InstitutionSchema, UserSchema } from '../../../lib/db-types';
import { getOrCreateStripeCustomerId, getStripeClient } from '../../lib/billing/stripe';

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

    const requiredPlans = await getRequiredPlansForCourseInstance(res.locals.course_instance.id);

    res.send(StudentCourseInstanceUpgrade({ requiredPlans, resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'upgrade') {
      console.log(res.locals);
      const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);
      const user = UserSchema.parse(res.locals.user);

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
        line_items: [
          {
            // (TEST) Course access
            price: 'price_1NcXivCnE0RA08SRx0axfkLD',
            quantity: 1,
          },
          {
            // (TEST) Compute
            price: 'price_1NcXk5CnE0RA08SRaMbYwToh',
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${urlBase}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${urlBase}/cancel?session_id={CHECKOUT_SESSION_ID}`,
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
          user_id: res.locals.user.id,
        },
        authn_user_id: res.locals.user.id,
      });
      await insertPlanGrant({
        plan_grant: {
          plan_name: 'compute',
          type: 'stripe',
          institution_id: institution.id,
          course_instance_id: course_instance.id,
          user_id: res.locals.user.id,
        },
        authn_user_id: res.locals.user.id,
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
