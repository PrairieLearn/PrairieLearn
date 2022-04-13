// @ts-check
const config = require('../lib/config');

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

module.exports = function (req, res, next) {
  const canonicalHost = config.serverCanonicalHost;

  // If this server isn't configured with a canonical host, this middleware
  // can't do anything useful.
  if (!canonicalHost) {
    return next();
  }

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
          return next();
        }
      }

      // If we fall through to here, we need to redirect to the canonical domain.
      const redirectUrl = new URL(req.originalUrl, canonicalHostUrl);
      redirectUrl.protocol = req.protocol;
      console.log('redirecting to', redirectUrl.toString());
      return res.redirect(302, redirectUrl.toString());
    }
  }

  // If we fall through to here, we're safe to continue on.
  next();
};
