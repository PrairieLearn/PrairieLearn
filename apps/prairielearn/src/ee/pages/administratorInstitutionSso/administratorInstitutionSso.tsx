import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { Hydrate } from '@prairielearn/react/server';
import {
  ArrayFromCheckboxSchema,
  IdSchema,
  parseRequest,
  parseRequestParams,
} from '@prairielearn/zod';

import { PageLayout } from '../../../components/PageLayout.js';
import { getSupportedAuthenticationProviders } from '../../../lib/authn-providers.js';
import { extractPageContext } from '../../../lib/client/page-context.js';
import {
  StaffAuthnProviderSchema,
  StaffInstitutionSchema,
} from '../../../lib/client/safe-db-types.js';
import { selectInstitutionIdentityConfigurationStatus } from '../../../lib/institution-identity.js';
import { updateInstitutionAuthnProviders } from '../../../models/institution-authn-provider.js';
import {
  getInstitution,
  getInstitutionAuthenticationProviders,
  getInstitutionSamlProvider,
} from '../../lib/institution.js';

import { AdministratorInstitutionSsoForm } from './components/AdministratorInstitutionSsoForm.js';

const router = Router({ mergeParams: true });

const ParamsSchema = z.object({ institution_id: IdSchema });

const PostRequestSchemas = {
  params: ParamsSchema,
  body: z.object({
    default_authn_provider_id: z.string().transform((s) => (s === '' ? null : s)),
    enabled_authn_provider_ids: ArrayFromCheckboxSchema,
  }),
};

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { params, body } = parseRequest(req, PostRequestSchemas);

    const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();
    const supportedAuthenticationProviderIds = new Set(
      supportedAuthenticationProviders.map((p) => p.id),
    );

    const enabledProviders = body.enabled_authn_provider_ids.filter((id) =>
      supportedAuthenticationProviderIds.has(id),
    );

    await updateInstitutionAuthnProviders({
      institution_id: params.institution_id,
      enabled_authn_provider_ids: enabledProviders,
      default_authn_provider_id: body.default_authn_provider_id,
      authn_user_id: res.locals.authn_user.id.toString(),
    });

    res.redirect(req.originalUrl);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { institution_id } = parseRequestParams(req, ParamsSchema);

    const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();

    const institution = await getInstitution(institution_id);
    const institutionSamlProvider = await getInstitutionSamlProvider(institution_id);
    const institutionAuthenticationProviders =
      await getInstitutionAuthenticationProviders(institution_id);
    const identityConfigurationStatus =
      await selectInstitutionIdentityConfigurationStatus(institution_id);

    const pageContext = extractPageContext(res.locals, {
      pageType: 'plain',
      accessType: 'instructor',
      withAuthzData: false,
    });

    res.send(
      PageLayout({
        resLocals: { ...res.locals, institution },
        pageTitle: 'SSO - Institution Admin',
        navContext: {
          type: 'administrator_institution',
          page: 'administrator_institution',
          subPage: 'sso',
        },
        content: (
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
              hasRosterSyncAllowed={
                identityConfigurationStatus.has_lti13_instance_with_roster_sync_allowed
              }
              urlPrefix={pageContext.urlPrefix}
              csrfToken={pageContext.__csrf_token}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
