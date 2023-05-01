// @ts-check
const { Router } = require('express');

const router = Router({ mergeParams: true });

// Currently, we don't have any notion of institution-level administrators, so
// we only allow global admins to do institution-level administration things.
// We should change this in the future.
router.use(require('../../../middlewares/authzIsAdministrator'));

router.use((req, res, next) => {
  // The navbar relies on this property.
  res.locals.urlPrefix = req.baseUrl;
  next();
});

router.use('/sso', require('./sso'));
router.use('/saml', require('./saml'));
router.use('/', (req, res) => {
  // Default fallthrough: redirect to the SSO configuration page.
  res.redirect(`${req.baseUrl}/sso`);
});

module.exports = router;
