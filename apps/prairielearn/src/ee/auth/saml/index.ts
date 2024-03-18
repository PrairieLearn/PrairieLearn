import { MultiSamlStrategy } from '@node-saml/passport-saml';

import { getInstitutionSamlProvider } from '../../lib/institution';

export const strategy = new MultiSamlStrategy(
  {
    passReqToCallback: true,
    getSamlOptions(req, done) {
      getInstitutionSamlProvider(req.params.institution_id)
        .then((samlProvider) => {
          if (!samlProvider) {
            return done(new Error('No SAML provider found for given institution'));
          }

          const host = req.headers.host;

          // This is also known as our Entity ID.
          const issuer = `https://${host}/saml/institution/${req.params.institution_id}`;

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

          done(null, {
            host,
            protocol: 'https://',
            path: `/pl/auth/institution/${req.params.institution_id}/saml/callback`,
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
            cert: samlProvider.certificate,

            // Service Provider's private key.
            privateKey: samlProvider.private_key,
            decryptionPvk: samlProvider.private_key,

            // By default, `node-saml` will include a `RequestedAuthnContext`
            // element that requests password-based authentication. However,
            // some institutions use passwordless auth, so we disable this and
            // allow any authentication context.
            disableRequestedAuthnContext: true,
          });
        })
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
