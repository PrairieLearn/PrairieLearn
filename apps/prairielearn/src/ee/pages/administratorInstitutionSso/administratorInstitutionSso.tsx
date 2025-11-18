import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { renderHtml } from '@prairielearn/preact';
import { Hydrate } from '@prairielearn/preact/server';
import { ArrayFromCheckboxSchema } from '@prairielearn/zod';

import { PageLayout } from '../../../components/PageLayout.js';
import { getSupportedAuthenticationProviders } from '../../../lib/authn-providers.js';
import { getPageContext } from '../../../lib/client/page-context.js';
import {
  StaffAuthnProviderSchema,
  StaffInstitutionSchema,
} from '../../../lib/client/safe-db-types.js';
import { updateInstitutionAuthnProviders } from '../../../models/institution-authn-provider.js';
import {
  getInstitution,
  getInstitutionAuthenticationProviders,
  getInstitutionSamlProvider,
} from '../../lib/institution.js';

import { AdministratorInstitutionSsoForm } from './components/AdministratorInstitutionSsoForm.js';

const router = Router({ mergeParams: true });

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();
    const supportedAuthenticationProviderIds = new Set(
      supportedAuthenticationProviders.map((p) => p.id),
    );

    const body = z
      .object({
        default_authn_provider_id: z.string().transform((s) => (s === '' ? null : s)),
        enabled_authn_provider_ids: ArrayFromCheckboxSchema,
      })
      .parse(req.body);

    const enabledProviders = body.enabled_authn_provider_ids.filter((id) =>
      supportedAuthenticationProviderIds.has(id),
    );

    await updateInstitutionAuthnProviders({
      institution_id: req.params.institution_id,
      enabled_authn_provider_ids: enabledProviders,
      default_authn_provider_id: body.default_authn_provider_id,
      authn_user_id: res.locals.authn_user.user_id.toString(),
    });

    res.redirect(req.originalUrl);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();

    const institution = await getInstitution(req.params.institution_id);
    const institutionSamlProvider = await getInstitutionSamlProvider(req.params.institution_id);
    const institutionAuthenticationProviders = await getInstitutionAuthenticationProviders(
      req.params.institution_id,
    );

    const pageContext = getPageContext(res.locals, { withAuthzData: false });

    res.send(
      PageLayout({
        resLocals: { ...res.locals, institution },
        pageTitle: 'SSO - Institution Admin',
        navContext: {
          type: 'administrator_institution',
          page: 'administrator_institution',
          subPage: 'sso',
        },
        content: renderHtml(
          <Hydrate>
            <AdministratorInstitutionSsoForm
              institution={StaffInstitutionSchema.parse(institution)}
              hasSamlProvider={!!institutionSamlProvider}
              supportedAuthenticationProviders={StaffAuthnProviderSchema.array().parse(
                supportedAuthenticationProviders,
              )}
              institutionAuthenticationProviders={StaffAuthnProviderSchema.array().parse(
                institutionAuthenticationProviders,
              )}
              urlPrefix={pageContext.urlPrefix}
              csrfToken={pageContext.__csrf_token}
            />
          </Hydrate>,
        ),
      }),
    );
  }),
);

export default router;
