const { OIDCStrategy } = require('passport-azure-ad');

const config = require('../../../lib/config');

module.exports.getAzureStrategy = function () {
  return new OIDCStrategy(
    {
      identityMetadata: config.azureIdentityMetadata,
      clientID: config.azureClientID,
      responseType: config.azureResponseType,
      responseMode: config.azureResponseMode,
      redirectUrl: config.azureRedirectUrl,
      allowHttpForRedirectUrl: config.azureAllowHttpForRedirectUrl,
      clientSecret: config.azureClientSecret,
      validateIssuer: config.azureValidateIssuer,
      isB2C: config.azureIsB2C,
      issuer: config.azureIssuer,
      passReqToCallback: config.azurePassReqToCallback,
      scope: config.azureScope,
      loggingLevel: config.azureLoggingLevel,
      nonceLifetime: config.azureNonceLifetime,
      nonceMaxAmount: config.azureNonceMaxAmount,
      useCookieInsteadOfSession: config.azureUseCookieInsteadOfSession,
      cookieEncryptionKeys: config.azureCookieEncryptionKeys,
      clockSkew: config.azureClockSkew,
    },
    function (iss, sub, profile, accessToken, refreshToken, done) {
      return done(null, profile);
    }
  );
};
