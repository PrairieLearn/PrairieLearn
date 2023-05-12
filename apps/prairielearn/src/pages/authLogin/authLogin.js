// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const { config } = require('../../lib/config');
const sqldb = require('@prairielearn/postgres');
const { isEnterprise } = require('../../lib/license');

const { AuthLogin, AuthLoginUnsupportedProvider } = require('./authLogin.html');

const sql = sqldb.loadSqlEquiv(__filename);
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const service = req.query.service ?? null;

    if (req.query.unsupported_provider === 'true') {
      // This requires an institution ID to work. If for some reason there
      // isn't one in the query params, redirect back to the normal login
      // page without any query params.
      const institutionId = req.query.institution_id ?? null;
      if (!institutionId) {
        res.redirect(req.baseUrl);
        return;
      }

      // Look up the supported providers for this institution.
      const supportedProvidersRes = await sqldb.queryAsync(
        sql.select_supported_providers_for_institution,
        {
          institution_id: institutionId,
        }
      );

      res.send(
        AuthLoginUnsupportedProvider({
          institutionId,
          supportedProviders: supportedProvidersRes.rows,
          service,
          resLocals: res.locals,
        })
      );
      return;
    }

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
            name:
              provider.long_name !== provider.short_name
                ? `${provider.long_name} (${provider.short_name})`
                : provider.long_name,
            url,
          };
        })
        .filter(Boolean);
    }

    res.send(AuthLogin({ service, institutionAuthnProviders, resLocals: res.locals }));
  })
);

module.exports = router;
