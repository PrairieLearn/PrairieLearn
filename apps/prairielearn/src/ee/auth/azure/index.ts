import { OIDCStrategy } from 'passport-azure-ad';

import { config } from '../../../lib/config.js';

export function getAzureStrategy() {
  return new OIDCStrategy(
    {
      identityMetadata: 'https://login.microsoftonline.com/common/.well-known/openid-configuration',
      clientID: config.azureClientID,
      redirectUrl: config.azureRedirectUrl,
      allowHttpForRedirectUrl: config.azureAllowHttpForRedirectUrl,
      clientSecret: config.azureClientSecret,
      cookieEncryptionKeys: config.azureCookieEncryptionKeys,
      loggingLevel: config.azureLoggingLevel,
      scope: ['openid', 'profile', 'email'],
      // This should only be `id_token`, which will force the implicit flow to
      // be used. When we specify `code id_token` here, it will use the hybrid
      // flow, which for whatever reason does not return user emails.
      //
      // The implicit flow isn't recommended for `response_type=token`, but it's
      // safe for us to use here because we're using `response_type=id_token`. We
      // don't ever need access/refresh tokens for our use case.
      responseType: 'id_token',
      responseMode: 'form_post',
      // We're using the common metadata endpoint, so we need to disable issuer validation.
      validateIssuer: false,
      passReqToCallback: false,
      // We don't want to use Express sessions, so we disable session support.
      useCookieInsteadOfSession: true,
    },
    function (iss, sub, profile, accessToken, refreshToken, done) {
      return done(null, profile);
    },
  );
}
