// @ts-check
const config = require('./config');

/**
 *
 * @param {(req: import('express').Request, res: import('express').Response) => string} getExpectedSubdomain
 * @returns {import('express').RequestHandler}
 */
module.exports.assertSubdomainOrRedirect = function (getExpectedSubdomain) {
  return function (req, res, next) {
    const expectedSubdomain = getExpectedSubdomain(req, res);

    // Validate the subdomain.
    const canonicalHost = config.serverCanonicalHost;
    const canonicalHostUrl = new URL(canonicalHost);
    const requestHostname = req.hostname;
    const requestSubdomain = requestHostname.split('.')[0];

    console.log('req.hostname', req.hostname);
    console.log('requestSubdomain', requestSubdomain);
    console.log('desiredSubdomain', expectedSubdomain);

    if (requestSubdomain !== expectedSubdomain) {
      canonicalHostUrl.hostname = `${expectedSubdomain}.${canonicalHostUrl.hostname}`;
      const redirectUrl = new URL(req.originalUrl, canonicalHostUrl);
      redirectUrl.protocol = req.protocol;
      console.log('redirecting to ', redirectUrl.toString());
      res.redirect(redirectUrl.toString());
      return;
    }

    next();
  };
};

module.exports.assertQuestionSubdomainOrRedirect = module.exports.assertSubdomainOrRedirect(
  (req, res) => {
    return `q${res.locals.question.id}`;
  }
);

module.exports.assertInstanceQuestionSubdomainOrRedirect = module.exports.assertSubdomainOrRedirect(
  (req, res) => {
    return `iq${res.locals.instance_question.id}`;
  }
);

module.exports.assertWorkspaceSubdomainOrRedirect = module.exports.assertSubdomainOrRedirect(
  (req, res) => {
    return `w${res.locals.workspace_id}`;
  }
);
