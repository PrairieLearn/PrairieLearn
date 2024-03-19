import { MultiSamlStrategy } from 'passport-saml';

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
          done(null, {
            host,
            protocol: 'https://',
            path: `/pl/auth/institution/${req.params.institution_id}/saml/callback`,
            entryPoint: samlProvider.sso_login_url,
            issuer,
            idpIssuer: samlProvider.issuer,
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
);
