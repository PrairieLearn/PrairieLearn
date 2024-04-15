import { Router } from 'express';
import asyncHandler = require('express-async-handler');

import authzIsAdministrator = require('../../middlewares/authzIsAdministrator');
import generalRouter from '../pages/administratiorInstitutionGeneral/administratiorInstitutionGeneral';
import coursesRouter from '../pages/administratorInstitutionCourses/administratorInstitutionCourses';
import courseRouter from '../pages/administratorInstitutionCourse/administratorInstitutionCourse';
import courseInstanceRouter from '../pages/administratorInstitutionCourseInstance/administratorInstitutionCourseInstance';
import ssoRouter from '../pages/administratorInstitutionSso/administratorInstitutionSso';
import samlRouter from '../pages/administratorInstitutionSaml/administratorInstitutionSaml';
import lti13Router from '../pages/administratorInstitutionLti13/administratorInstitutionLti13';
import { features } from '../../lib/features';

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
