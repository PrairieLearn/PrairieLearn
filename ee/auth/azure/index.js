// @ts-check
const { OIDCStrategy } = require('passport-azure-ad');

const { config } = require('../../../lib/config');

module.exports.getAzureStrategy = function () {
  return new OIDCStrategy(
    {
      identityMetadata: 'https://login.microsoftonline.com/common/.well-known/openid-configuration',
      clientID: config.azureClientID,
      redirectUrl: config.azureRedirectUrl,
      allowHttpForRedirectUrl: config.azureAllowHttpForRedirectUrl,
      clientSecret: config.azureClientSecret,
      cookieEncryptionKeys: config.azureCookieEncryptionKeys,
      loggingLevel: config.azureLoggingLevel,
      responseType: 'code id_token',
      responseMode: 'form_post',
      // We're using the common metadata endpoint, so we need to disable issuer validation.
      validateIssuer: false,
      passReqToCallback: false,
      // We don't want to use Express sessions, so we disable session support.
      useCookieInsteadOfSession: true,
    },
    function (iss, sub, profile, accessToken, refreshToken, done) {
      return done(null, profile);
    }
  );
};
