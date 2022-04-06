// @ts-check

const ALLOWED_FROM_ANY_SUBDOMAIN = [/^\/assets/, /^\/cacheable_node_modules/];

/**
 * Specifies a list of subdomain patterns and the routes that pages served from
 * that subdomain should be able to access.
 */
const SUBDOMAINS = [
  {
    pattern: /variant-\d+/,
    allowedRoutes: [/^\/pl\/course\/\d+\/question\/\d+\/preview/],
  },
];

function allowAccess(requestHostname, requestOrigin, originalUrl) {
  const requestSubdomain = requestHostname.split('.')[0];

  const matchedSubdomain = SUBDOMAINS.find((sub) => requestSubdomain.match(sub.pattern));
  const isToSubdomain = !!matchedSubdomain;

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
      return matchedSubdomain.allowedRoutes.some((r) => originalUrl.match(r));
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
      return matchedSubdomain.allowedRoutes.some((r) => originalUrl.match(r));
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
module.exports.middleware = function validateSubdomainRequest(req, res, next) {
  const requestHostname = req.hostname;
  const requestOrigin = req.get('Origin');

  if (allowAccess(requestHostname, requestOrigin, req.originalUrl)) {
    next();
  } else {
    res.status(403).send('Forbidden');
  }
};

module.exports.allowAccess = allowAccess;
