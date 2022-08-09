// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const { isEnterprise } = require('../../lib/license');

const sql = sqlLoader.loadSqlEquiv(__filename);
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

    // We could set res.locals.config.hasOauth = false (or
    // hasAzure) to not display those options inside the CBTF, but
    // this will also need to depend on which institution we have
    // detected (e.g., UIUC doesn't want Azure during exams, but
    // ZJUI does want it).
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

module.exports = router;
