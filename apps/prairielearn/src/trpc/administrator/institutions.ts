import { z } from 'zod';

import { getSupportedAuthenticationProviders } from '../../lib/authn-providers.js';
import { suggestTimezone as suggestTimezoneImpl } from '../../lib/course-request-ai.js';
import { updateInstitutionAuthnProviders } from '../../models/institution-authn-provider.js';
import { insertInstitution } from '../../models/institution.js';

import { requireAdministrator, t } from './init.js';

const suggestTimezone = t.procedure
  .use(requireAdministrator)
  .input(z.object({ institutionName: z.string(), emailDomain: z.string() }))
  .output(
    z.object({
      timezone: z.string(),
      reasoning: z.string(),
    }),
  )
  .query(async ({ input }) => {
    const { timezone, reasoning } = await suggestTimezoneImpl({
      emailDomain: input.emailDomain,
      institutionName: input.institutionName,
    });
    return { timezone, reasoning };
  });

const addInstitution = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      shortName: z.string().trim().min(1),
      longName: z.string().trim().min(1),
      displayTimezone: z.string().trim().min(1),
      uidRegexp: z.string().trim(),
      enabledAuthnProviderIds: z.array(z.string()),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const institutionId = await insertInstitution({
      shortName: input.shortName,
      longName: input.longName,
      displayTimezone: input.displayTimezone,
      uidRegexp: input.uidRegexp || null,
    });

    // Handle authentication provider setup
    const allSupportedProviders = await getSupportedAuthenticationProviders();
    const supportedProviderIds = new Set(allSupportedProviders.map((p) => p.id));

    const enabledProviders = input.enabledAuthnProviderIds.filter((id) =>
      supportedProviderIds.has(id),
    );

    await updateInstitutionAuthnProviders({
      institution_id: institutionId,
      enabled_authn_provider_ids: enabledProviders,
      default_authn_provider_id: null,
      authn_user_id: ctx.authn_user.id.toString(),
    });
  });

export const administratorInstitutionsRouter = t.router({
  suggestTimezone,
  addInstitution,
});
