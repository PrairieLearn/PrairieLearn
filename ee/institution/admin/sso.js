// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');
const z = require('zod');

const sqldb = require('../../../prairielib/sql-db');
const sqlLoader = require('../../../prairielib/lib/sql-loader');

const { InstitutionAdminSso } = require('./sso.html');
const {
  getInstitution,
  getAllAuthenticationProviders,
  getInstitutionAuthenticationProviders,
  getInstitutionSamlProvider,
} = require('./utils');

const sql = sqlLoader.loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

const enabledProvidersSchema = z.array(z.string());

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const enabledProviders = enabledProvidersSchema.parse(
      req.body.enabled_authn_provider_ids ?? []
    );
    if (enabledProviders.length === 0) {
      throw new Error('At least one authentication provider must be enabled');
    }

    let defaultProvider = req.body.default_authn_provider_id;
    if (defaultProvider === '') defaultProvider = null;

    await sqldb.queryAsync(sql.update_institution_sso_config, {
      institution_id: req.params.institution_id,
      enabled_authn_provider_ids: enabledProviders,
      default_authn_provider_id: defaultProvider,
    });

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
