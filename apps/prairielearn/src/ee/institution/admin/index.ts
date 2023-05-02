import { Router } from 'express';

import authzIsAdministrator = require('../../../middlewares/authzIsAdministrator');
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

router.use('/sso', ssoRouter);
router.use('/saml', samlRouter);
router.use('/', (req, res) => {
  // Default fallthrough: redirect to the SSO configuration page.
  res.redirect(`${req.baseUrl}/sso`);
});

export default router;
