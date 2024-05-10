import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import authzIsAdministrator from '../../middlewares/authzIsAdministrator.js';
import generalRouter from '../pages/administratorInstitutionGeneral/administratorInstitutionGeneral.js';
import coursesRouter from '../pages/administratorInstitutionCourses/administratorInstitutionCourses.js';
import courseRouter from '../pages/administratorInstitutionCourse/administratorInstitutionCourse.js';
import courseInstanceRouter from '../pages/administratorInstitutionCourseInstance/administratorInstitutionCourseInstance.js';
import ssoRouter from '../pages/administratorInstitutionSso/administratorInstitutionSso.js';
import samlRouter from '../pages/administratorInstitutionSaml/administratorInstitutionSaml.js';
import lti13Router from '../pages/administratorInstitutionLti13/administratorInstitutionLti13.js';
import { features } from '../../lib/features/index.js';

const router = Router({ mergeParams: true });

// Currently, we don't have any notion of institution-level administrators, so
// we only allow global admins to do institution-level administration things.
// We should change this in the future.
router.use(authzIsAdministrator);

router.use(
  asyncHandler(async (req, res, next) => {
    // The navbar relies on this property.
    res.locals.urlPrefix = req.baseUrl;

    const hasLti13 = await features.enabled('lti13', { institution_id: req.params.institution_id });
    res.locals.lti13_enabled = hasLti13;
    next();
  }),
);

router.use('/', generalRouter);
router.use('/courses', coursesRouter);
router.use('/course/:course_id', courseRouter);
router.use('/course_instance/:course_instance_id', courseInstanceRouter);
router.use('/sso', ssoRouter);
router.use('/saml', samlRouter);
router.use('/lti13', lti13Router);

export default router;
