import { Router } from 'express';

import authzIsAdministrator = require('../../../middlewares/authzIsAdministrator');
import generalRouter from './general';
import coursesRouter from './courses';
import courseRouter from './course';
import ssoRouter from './sso';
import samlRouter from './saml';

const router = Router({ mergeParams: true });

// Currently, we don't have any notion of institution-level administrators, so
// we only allow global admins to do institution-level administration things.
// We should change this in the future.
router.use(authzIsAdministrator);

router.use((req, res, next) => {
  // The navbar relies on this property.
  res.locals.urlPrefix = req.baseUrl;
  next();
});

router.use('/', generalRouter);
router.use('/courses', coursesRouter);
router.use('/course/:course_id', courseRouter);
router.use('/sso', ssoRouter);
router.use('/saml', samlRouter);

export default router;
