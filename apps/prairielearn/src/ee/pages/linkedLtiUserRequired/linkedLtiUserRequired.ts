import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { selectLti13InstanceIdentitiesForCourseInstance } from '../../models/lti13-user.js';

import { LinkedLtiUserRequired } from './linkedLtiUserRequired.html.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const lti13InstanceIdentities = await selectLti13InstanceIdentitiesForCourseInstance({
      course_instance: res.locals.course_instance,
      user: res.locals.authn_user,
    });

    const instancesWithMissingIdentities = lti13InstanceIdentities.filter(
      ({ lti13_instance, lti13_user_id }) => {
        return lti13_instance.require_linked_lti_user && lti13_user_id == null;
      },
    );

    if (instancesWithMissingIdentities.length === 0) {
      // The user ended up on this page for some reason even though all necessary
      // linked accounts are present. Redirect them to the course instance.
      res.redirect(`/pl/course_instance/${res.locals.course_instance.id}`);
      return;
    }

    res.send(
      LinkedLtiUserRequired({
        instancesWithMissingIdentities,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
