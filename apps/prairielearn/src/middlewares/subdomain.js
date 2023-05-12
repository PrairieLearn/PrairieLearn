// @ts-check
const error = require('@prairielearn/error');
const config = require('../lib/config');

/**
 * Specifies all routes that should always be accessible from any subdomain.
 */
const ALLOWED_FROM_ANY_SUBDOMAIN = [/^\/assets/, /^\/cacheable_node_modules/, /^\/favicon.ico/];

/**
 * Specifies a list of subdomain patterns and the routes that pages served from
 * that subdomain should be able to access.
 */
const SUBDOMAINS = [
  {
    // Instructor question pages.
    pattern: /^q\d+$/,
    routes: [
      /^\/pl\/course\/\d+\/question\/\d+\/preview/,
      /^\/pl\/course_instance\/\d+\/instructor\/question\/\d+\/preview/,
    ],
  },
  {
    // Instance question pages.
    pattern: /^iq\d+$/,
    routes: [/^\/pl\/course_instance\/\d+\/instance_question\/\d+/],
  },
  {
    // Workspace pages.
    pattern: /^w\d+$/,
    routes: [/^\/pl\/workspace\/\d+/],
  },
];

/**
 * Returns whether or not the server is configured to serve untrusted content
 * from subdomains. `serverCanonicalHost` and `serveUntrustedContentFromSubdomains`
 * must both be set and truthy for this to return true.
 *
 * @returns {boolean}
 */
function shouldUseSubdomains() {
  return !!config.serverCanonicalHost && !!config.serveUntrustedContentFromSubdomains;
}

/**
 *
 * @param {string} requestHostname
 * @param {string} requestOrigin
 * @param {string} originalUrl
 * @returns {boolean}
 */
function allowAccess(requestHostname, requestOrigin, originalUrl) {
  const requestSubdomain = requestHostname.split('.')[0];

  const matchedSubdomain = SUBDOMAINS.find((sub) => requestSubdomain.match(sub.pattern));
  const isToSubdomain = !!matchedSubdomain;
  const allowedRoutes = [
    ...ALLOWED_FROM_ANY_SUBDOMAIN,
    ...(matchedSubdomain ? matchedSubdomain.routes : []),
  ];

  if (requestOrigin) {
    // If the `Origin` header is present, that means we're probably crossing
    // origins.
    //
    // TODO: what about the case where `Origin` is set but we're *not* crossing
    // origins? Figure out what to do there. Do we need anything special?

    const requestOriginHostname = new URL(requestOrigin).hostname;
    const requestOriginSubdomain = requestOriginHostname.split('.')[0];

    // We might be crossing origins. Validate that the `Origin` header
    // corresponds to the subdomain that the request is trying to access.
    // If it's not, we'll error.
    if (isToSubdomain) {
      if (requestOriginSubdomain !== requestSubdomain) {
        return false;
      }

      // If we fall through to here, this means that the request included an
      // `Origin` header but didn't actually cross origins; that is, this is a
      // non-CORS request to a subdomain. We'll validate that the given origin
      // is allowed to access the resource for the current request.
      // TODO: actually do that validation.
      return allowedRoutes.some((r) => originalUrl.match(r));
    }

    if (!isToSubdomain) {
      // The current request might be crossing origins from a subdomain to
      // a non-subdomain, or it might be a request from and to a non-subdomain.

      if (requestOriginHostname === requestHostname) {
        // The request is from a non-subdomain to a non-subdomain.
        // This is always fine.
        return true;
      }

      // If we fall through to here, the current request is crossing origins
      // from a subdomain to *not* a subdomain.
      //
      // This is allowed for a subset of routes, e.g. all static resources.
      // We want those to be accessible from any subdomain. However, for other
      // routes, they should not actually be accessible.
      return ALLOWED_FROM_ANY_SUBDOMAIN.some((pattern) => originalUrl.match(pattern));
    }
  } else {
    // The `Origin` header is not present. This could be a same-origin request,
    // or it could be a cross-origin request that didn't actually send an
    // `Origin` header.

    if (isToSubdomain) {
      // The current request is to a subdomain. We'll validate that the
      // request is allowed to access the resource for the current request.
      return allowedRoutes.some((r) => originalUrl.match(r));
    } else {
      // This request was not to a subdomain and is also not crossing origins.
      // This means that the request is coming from and destined for the actual
      // canonical host. We can safely continue.
      return true;
    }
  }
}

/**
 * This middleware complements the `subdomainRedirect` middleware. If a
 * request makes it past that middleware, we can check if the `Origin` header
 * indicates that the request is coming from a subdomain. If it is, we'll
 * validate that it's a request that should be able to be made from that
 * particular subdomain. If it is not, we'll error.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function validateSubdomainRequest(req, res, next) {
  if (!shouldUseSubdomains()) {
    next();
    return;
  }

  const requestHostname = req.hostname;
  const requestOrigin = req.get('Origin');

  if (allowAccess(requestHostname, requestOrigin, req.originalUrl)) {
    next();
  } else {
    next(error.make(403, 'Forbidden'));
  }
}

/**
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function subdomainRedirect(req, res, next) {
  if (!shouldUseSubdomains()) {
    next();
    return;
  }

  const canonicalHost = config.serverCanonicalHost;
  const canonicalHostUrl = new URL(canonicalHost);

  // If the deepest subdomain matches a subdomain where we would actually serve
  // content from, validate that the route is something that we should actually
  // serve from. If it doesn't, redirect to the original URL but on our
  // "canonical" host.
  const requestSubdomain = req.hostname.split('.')[0];
  for (const sub of SUBDOMAINS) {
    if (requestSubdomain.match(sub.pattern)) {
      for (const route of sub.routes) {
        if (req.originalUrl.match(route)) {
          next();
          return;
        }
      }

      // If we fall through to here, we need to redirect to the canonical domain.
      const redirectUrl = new URL(req.originalUrl, canonicalHostUrl);
      redirectUrl.protocol = req.protocol;
      res.redirect(302, redirectUrl.toString());
      return;
    }
  }

  // If we fall through to here, we're safe to continue on.
  next();
}

/**
 *
 * @param {(req: import('express').Request, res: import('express').Response) => string} getExpectedSubdomain
 * @returns {import('express').RequestHandler}
 */
function assertSubdomainOrRedirect(getExpectedSubdomain) {
  return function (req, res, next) {
    if (!shouldUseSubdomains()) {
      next();
      return;
    }

    const expectedSubdomain = getExpectedSubdomain(req, res);

    // Validate the subdomain.
    const canonicalHost = config.serverCanonicalHost;
    const canonicalHostUrl = new URL(canonicalHost);
    const requestHostname = req.hostname;
    const requestSubdomain = requestHostname.split('.')[0];

    if (requestSubdomain !== expectedSubdomain) {
      canonicalHostUrl.hostname = `${expectedSubdomain}.${canonicalHostUrl.hostname}`;
      const redirectUrl = new URL(req.originalUrl, canonicalHostUrl);
      redirectUrl.protocol = req.protocol;
      res.redirect(redirectUrl.toString());
      return;
    }

    next();
  };
}

const assertQuestionSubdomainOrRedirect = assertSubdomainOrRedirect(
  (req, res) => `q${res.locals.question.id}`
);

const assertInstanceQuestionSubdomainOrRedirect = assertSubdomainOrRedirect(
  (req, res) => `iq${res.locals.instance_question.id}`
);

const assertWorkspaceSubdomainOrRedirect = assertSubdomainOrRedirect(
  (req, res) => `w${res.locals.workspace_id}`
);

module.exports.allowAccess = allowAccess;
module.exports.validateSubdomainRequest = validateSubdomainRequest;
module.exports.subdomainRedirect = subdomainRedirect;
module.exports.assertSubdomainOrRedirect = assertSubdomainOrRedirect;
module.exports.assertQuestionSubdomainOrRedirect = assertQuestionSubdomainOrRedirect;
module.exports.assertInstanceQuestionSubdomainOrRedirect =
  assertInstanceQuestionSubdomainOrRedirect;
module.exports.assertWorkspaceSubdomainOrRedirect = assertWorkspaceSubdomainOrRedirect;
