// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');
const z = require('zod');

const sqldb = require('../../../prairielib/sql-db');
const sqlLoader = require('../../../prairielib/lib/sql-loader');

const { InstitutionAdminSso } = require('./sso.html');
const {
  getInstitution,
  getSupportedAuthenticationProviders,
  getInstitutionAuthenticationProviders,
  getInstitutionSamlProvider,
} = require('../utils');

const sql = sqlLoader.loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

const enabledProvidersSchema = z.array(z.string());

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();
    const supportedAuthenticationProviderIds = new Set(
      supportedAuthenticationProviders.map((p) => p.id)
    );

    const rawEnabledAuthnProviderIds = ensureArray(req.body.enabled_authn_provider_ids ?? []);
    const enabledProviders = enabledProvidersSchema
      .parse(rawEnabledAuthnProviderIds)
      .filter((id) => supportedAuthenticationProviderIds.has(id));
    if (enabledProviders.length === 0) {
      throw new Error('At least one authentication provider must be enabled');
    }

    let defaultProvider = req.body.default_authn_provider_id;
    if (defaultProvider === '') defaultProvider = null;

    await sqldb.queryAsync(sql.update_institution_sso_config, {
      institution_id: req.params.institution_id,
      enabled_authn_provider_ids: enabledProviders,
      default_authn_provider_id: defaultProvider,
      // For audit logs
      authn_user_id: res.locals.authn_user.user_id,
    });

    res.redirect(req.originalUrl);
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();

    const institution = await getInstitution(req.params.institution_id);
    const institutionSamlProvider = await getInstitutionSamlProvider(req.params.institution_id);
    const institutionAuthenticationProviders = await getInstitutionAuthenticationProviders(
      req.params.institution_id
    );

    res.send(
      InstitutionAdminSso({
        supportedAuthenticationProviders,
        institution,
        institutionSamlProvider,
        institutionAuthenticationProviders,
        resLocals: res.locals,
      })
    );
  })
);

module.exports = router;
