import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import sqldb = require('@prairielearn/postgres');

import { config } from '../../lib/config';
import { isEnterprise } from '../../lib/license';

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

          let url: string | null = null;
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

    res.render(__filename.replace(/\.[jt]s$/, '.ejs'), res.locals);
  })
);

export default router;
