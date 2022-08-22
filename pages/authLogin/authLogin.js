// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const config = require('../../lib/config');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const { isEnterprise } = require('../../lib/license');

const { AuthLogin } = require('./authLogin.html');

const sql = sqlLoader.loadSqlEquiv(__filename);
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const service = req.query.service ?? null;
    let institutionAuthnProviders = null;

    if (isEnterprise()) {
      const institutionAuthnProvidersRes = await sqldb.queryAsync(
        sql.select_institution_authn_providers,
        {}
      );
      institutionAuthnProviders = institutionAuthnProvidersRes.rows
        .map((provider) => {
          // Special case: omit the default institution in production.
          if (provider.id === '1' && config.devMode === false) return null;

          let url = null;
          switch (provider.default_authn_provider_name) {
            case 'SAML':
              url = `/pl/auth/institution/${provider.id}/saml/login`;
              break;
            case 'Google':
              url = '/pl/oauth2login';
              break;
            case 'Azure':
              url = '/pl/azure_login';
              break;
            case 'Shibboleth':
              url = '/pl/shibcallback';
              break;
            default:
              return null;
          }

          return {
            name: `${provider.long_name} (${provider.short_name})`,
            url,
          };
        })
        .filter(Boolean);
    }

    res.send(AuthLogin({ service, institutionAuthnProviders, resLocals: res.locals }));
  })
);

module.exports = router;
