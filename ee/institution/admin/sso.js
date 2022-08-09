// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const { InstitutionAdminSso } = require('./sso.html');
const {
  getInstitution,
  getAllAuthenticationProviders,
  getInstitutionAuthenticationProviders,
  getInstitutionSamlProvider,
} = require('./utils');

const router = Router({ mergeParams: true });

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // TODO: validate that at least one authn provider is selected.
    console.log(req.body);
    res.redirect(req.originalUrl);
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const allAuthenticationProviders = await getAllAuthenticationProviders();

    const institution = await getInstitution(req.params.institution_id);
    const institutionSamlProvider = await getInstitutionSamlProvider(req.params.institution_id);
    const institutionAuthenticationProviders = await getInstitutionAuthenticationProviders(
      req.params.institution_id
    );

    res.send(
      InstitutionAdminSso({
        allAuthenticationProviders,
        institution,
        institutionSamlProvider,
        institutionAuthenticationProviders,
        resLocals: res.locals,
      })
    );
  })
);

module.exports = router;
