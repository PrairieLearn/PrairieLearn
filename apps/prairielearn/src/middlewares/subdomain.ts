import type { Request, Response, NextFunction, RequestHandler } from 'express';

import * as error from '@prairielearn/error';

import { config } from '../lib/config.js';

/**
 * Specifies all routes that should always be accessible from any subdomain.
 */
const ALLOWED_FROM_ANY_SUBDOMAIN = [
  /^\/assets/,
  /^\/cacheable_node_modules/,
  /^\/favicon.ico/,
  // Legacy `node_modules` assets.
  /^\/node_modules/,
  // Legacy assets - corresponds to paths in `/public`.
  /^\/images/,
  /^\/javascripts/,
  /^\/localscripts/,
  /^\/stylesheets/,
];

/**
 * Specifies a list of subdomain patterns and the routes that pages served from
 * that subdomain should be able to access.
 */
const SUBDOMAINS = [
  {
    // Instructor question pages.
    patternPrefix: 'q',
    pattern: /^q\d+$/,
    routes: [
      /^\/pl\/public\/course\/\d+\/question\/(\d+)/i,
      /^\/pl\/course\/\d+\/question\/(\d+)\/preview/i,
      /^\/pl\/course\/\d+\/question\/(\d+)\/clientFilesQuestion/i,
      /^\/pl\/course\/\d+\/question\/(\d+)\/submission/i,
      /^\/pl\/course_instance\/\d+\/instructor\/question\/(\d+)\/preview/i,
      /^\/pl\/course_instance\/\d+\/instructor\/question\/(\d+)\/clientFilesQuestion/i,
      /^\/pl\/course_instance\/\d+\/instructor\/question\/(\d+)\/submission/i,
    ],
  },
  {
    // Instance question pages.
    patternPrefix: 'iq',
    pattern: /^iq\d+$/,
    routes: [
      /^\/pl\/course_instance\/\d+\/instance_question\/(\d+)/i,
      /^\/pl\/course_instance\/\d+\/instructor\/assessment\/\d+\/manual_grading\/instance_question\/(\d+)/i,
    ],
  },
  {
    // Workspace pages.
    patternPrefix: 'w',
    pattern: /^w\d+$/i,
    routes: [/^\/pl\/workspace\/(\d+)/i],
  },
  {
    // Course pages serving user-generated content.
    patternPrefix: 'c',
    pattern: /^c\d+$/,
    routes: [/^\/pl\/course\/(\d+)\/clientFilesCourse/i],
  },
  {
    // Course instance pages serving user-generated content.
    patternPrefix: 'ci',
    pattern: /^ci\d+$/,
    routes: [
      /^\/pl\/course_instance\/(\d+)\/instructor\/clientFilesCourse/i,
      /^\/pl\/course_instance\/(\d+)\/instructor\/clientFilesCourseInstance/i,
      /^\/pl\/course_instance\/(\d+)\/clientFilesCourse/i,
      /^\/pl\/course_instance\/(\d+)\/clientFilesCourseInstance/i,
    ],
  },
  {
    // Assessment pages serving user-generated content.
    patternPrefix: 'a',
    pattern: /^a\d+$/,
    routes: [
      /^\/pl\/course_instance\/\d+\/instructor\/assessment\/(\d+)\/clientFilesAssessment/i,
      /^\/pl\/course_instance\/\d+\/assessment\/(\d+)\/clientFilesAssessment/i,
    ],
  },
  {
    // Assessment instance pages serving user-generated content.
    patternPrefix: 'ai',
    pattern: /^ai\d+/,
    routes: [/^\/pl\/course_instance\/\d+\/assessment_instance\/(\d+)/i],
  },
];

// All route regular expressions must use case-insensitive matching since that
// matches how Express routes thing by default. We'll programmatically enforce
// that here.
for (const subdomain of SUBDOMAINS) {
  for (const route of subdomain.routes) {
    if (!route.ignoreCase) {
      throw new Error(`Route ${route} must use case-insensitive matching`);
    }
  }
}

/**
 * Returns whether or not the server is configured to serve untrusted content
 * from subdomains. `serverCanonicalHost` and `serveUntrustedContentFromSubdomains`
 * must both be set and truthy for this to return true.
 */
function shouldUseSubdomains() {
  return !!config.serverCanonicalHost && !!config.serveUntrustedContentFromSubdomains;
}

export function allowAccess(
  requestHostname: string,
  requestOrigin: string | null | undefined,
  originalUrl: string,
): boolean {
  const requestSubdomain = requestHostname.split('.')[0];

  const matchedSubdomain = SUBDOMAINS.find((sub) => requestSubdomain.match(sub.pattern));
  const isToSubdomain = !!matchedSubdomain;
  const allowedRoutes = [
    ...ALLOWED_FROM_ANY_SUBDOMAIN,
    ...(matchedSubdomain ? matchedSubdomain.routes : []),
  ];

  // The `Origin` header can be `null` in some cases:
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin
  //
  // The one that matters for us is when a fetch/XHR request redirects across
  // origins, which can happen in e.g. v2 questions that dynamically load HTML
  // documents on the client. We'll treat this as though the `Origin` header
  // wasn't sent at all.
  //
  // TODO: is that actually the right thing to do?
  if (requestOrigin && requestOrigin !== 'null') {
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
    } else {
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
 */
export function validateSubdomainRequest(req: Request, res: Response, next: NextFunction) {
  if (!shouldUseSubdomains()) {
    next();
    return;
  }

  const requestHostname = req.hostname;
  const requestOrigin = req.get('Origin');

  if (allowAccess(requestHostname, requestOrigin, req.originalUrl)) {
    next();
  } else {
    next(new error.HttpStatusError(403, 'Forbidden'));
  }
}

export function subdomainRedirect(req: Request, res: Response, next: NextFunction) {
  if (!shouldUseSubdomains()) {
    next();
    return;
  }

  const canonicalHost = config.serverCanonicalHost as string;
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

export function assertSubdomainOrRedirect(
  getExpectedSubdomain: (req: Request, res: Response) => string,
  active: boolean,
): RequestHandler {
  return function (req, res, next) {
    if (!shouldUseSubdomains() || !active) {
      next();
      return;
    }

    const expectedSubdomain = getExpectedSubdomain(req, res);

    // Validate the subdomain.
    const canonicalHost = config.serverCanonicalHost as string;
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

export function autoAssertSubdomainOrRedirect(req, res, next) {
  for (const subdomain of SUBDOMAINS) {
    for (const route of subdomain.routes) {
      const match = req.originalUrl.match(route);
      if (match) {
        const subdomainId = match[1];

        if (!subdomainId) {
          next(new Error(`Could not find subdomain ID in ${req.originalUrl}`));
          return;
        }

        const expectedSubdomain = `${subdomain.patternPrefix}${subdomainId}`;
        return assertSubdomainOrRedirect(() => expectedSubdomain, true)(req, res, next);
      }
    }
  }

  return next();
}

// These are likely not necessary anymore if the above `autoAssertSubdomainOrRedirect`
// function is working correctly.

export const assertCourseSubdomainOrRedirect = assertSubdomainOrRedirect(
  (req, res) => `c${res.locals.course.id}`,
  false,
);

export const assertCourseInstanceSubdomainOrRedirect = assertSubdomainOrRedirect(
  (req, res) => `ci${res.locals.course_instance.id}`,
  false,
);

export const assertAssessmentSubdomainOrRedirect = assertSubdomainOrRedirect(
  (req, res) => `a${res.locals.assessment.id}`,
  false,
);

export const assertAssessmentInstanceSubdomainOrRedirect = assertSubdomainOrRedirect(
  (req, res) => `ai${res.locals.assessment_instance.id}`,
  false,
);

export const assertQuestionSubdomainOrRedirect = assertSubdomainOrRedirect(
  (req, res) => `q${res.locals.question.id}`,
  false,
);

export const assertInstanceQuestionSubdomainOrRedirect = assertSubdomainOrRedirect(
  (req, res) => `iq${res.locals.instance_question.id}`,
  false,
);

export const assertWorkspaceSubdomainOrRedirect = assertSubdomainOrRedirect(
  (req, res) => `w${res.locals.workspace_id}`,
  false,
);
