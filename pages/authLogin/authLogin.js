// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const { config } = require('../../lib/config');
const sqldb = require('@prairielearn/postgres');
const { isEnterprise } = require('../../lib/license');

const sql = sqldb.loadSqlEquiv(__filename);
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    res.locals.service = req.query.service ?? null;
    res.locals.institutionAuthnProviders = null;

    if (isEnterprise()) {
      const institutionAuthnProviders = await sqldb.queryAsync(
        sql.select_institution_authn_providers,
        {}
      );
      res.locals.institutionAuthnProviders = institutionAuthnProviders.rows
        .map((provider) => {
          // Special case: omit the default institution.
          if (provider.id === '1') return null;

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

    res.locals.hasAzure = config.hasAzure && isEnterprise();

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

module.exports = router;
