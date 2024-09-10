import { MultiSamlStrategy, type SamlConfig } from '@node-saml/passport-saml';

import {
  getInstitutionAuthenticationProviders,
  getInstitutionSamlProvider,
} from '../../lib/institution.js';

export async function getSamlOptions({
  institution_id,
  host,
  strictMode,
}: {
  institution_id: string;
  host: string | undefined;
  strictMode: boolean;
}): Promise<SamlConfig> {
  const samlProvider = await getInstitutionSamlProvider(institution_id);
  const authenticationProviders = await getInstitutionAuthenticationProviders(institution_id);
  if (!samlProvider || !authenticationProviders.some((p) => p.name === 'SAML')) {
    throw new Error('No SAML provider found for given institution');
  }

  // It's most convenient if folks can pass in `req.headers.host` directly,
  // but that's typed as `string | undefined`. So, we'll accept that type
  // and throw an error on on the off-change it's undefined.
  if (!host) throw new Error('Missing host header');

  // This is also known as our Entity ID.
  const issuer = `https://${host}/saml/institution/${institution_id}`;

  return {
    callbackUrl: `https://${host}/pl/auth/institution/${institution_id}/saml/callback`,
    entryPoint: samlProvider.sso_login_url,
    issuer,
    idpIssuer: samlProvider.issuer,

    // TODO: once all existing IdPs are updated to use the stricter,
    // more secure defaults, enable all these by default.
    audience: samlProvider.validate_audience || strictMode ? issuer : false,
    wantAssertionsSigned: samlProvider.want_assertions_signed || strictMode,
    wantAuthnResponseSigned: samlProvider.want_authn_response_signed || strictMode,

    // TODO: do these two need to be configurable?
    signatureAlgorithm: 'sha256',
    digestAlgorithm: 'sha256',

    // Identity Provider's public key.
    idpCert: samlProvider.certificate,

    // Service Provider's public key.
    publicCert: samlProvider.public_key,

    // Service Provider's private key.
    privateKey: samlProvider.private_key,
    decryptionPvk: samlProvider.private_key,

    // By default, `node-saml` will include a `RequestedAuthnContext`
    // element that requests password-based authentication. However,
    // some institutions use passwordless auth, so we disable this and
    // allow any authentication context.
    disableRequestedAuthnContext: true,
  };
}

export const strategy = new MultiSamlStrategy(
  {
    passReqToCallback: true,
    getSamlOptions(req, done) {
      // v4 of `@node-saml/node-saml` made some breaking changes that could
      // result in broken logins if IdPs aren't configured correctly. In
      // particular:
      //
      // - `wantAssertionsSigned` is now true by default
      // - `wantAuthnResponseSigned` is now true by default
      // - The audience of the SAML response is now validated by default
      //
      // To continue supporting existing IdPs, we introduced configuration
      // options for SAML providers that default to the older, less strict
      // behavior. However, we want to encourage IdPs to meet the more
      // strict default behavior. We want to allow institutional IT folks
      // to see if they can comply with the new defaults without changing
      // our own configuration (which would risk breaking existing logins).
      //
      // To support this, we allow authentication requests to be made in
      // an optional "strict" mode. This is done by including the value
      // `strict` in the `RelayState` parameter of the SAML request, which
      // will also be included in the SAML response.
      const relayState = req.query?.RelayState || req.body?.RelayState || '';
      const relayStateItems = relayState.split(',');
      const strictMode = relayStateItems.includes('strict');

      getSamlOptions({
        institution_id: req.params.institution_id,
        host: req.headers.host,
        strictMode,
      })
        .then((options) => done(null, options))
        .catch((err) => done(err));
    },
  },
  function (req, profile, done) {
    done(null, profile ?? undefined);
  },
  function (req, profile, done) {
    done(null, profile ?? undefined);
  },
);
