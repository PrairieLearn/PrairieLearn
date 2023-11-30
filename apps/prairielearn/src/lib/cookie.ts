import type { Request, Response, NextFunction } from 'express';

import { config } from './config';

export function shouldSecureCookie(req: Request): boolean {
  // In production, always set secure: true. Otherwise, only set it to true if
  // the request is made over HTTPS.
  //
  // `req.protocol` should reflect Express' `trust proxy` setting, which should
  // be used when the app is behind a reverse proxy or load balancer.
  return !config.devMode || req.protocol === 'https';
}

const THIRTY_DAYS_IN_MILLISECONDS = 1000 * 60 * 60 * 24 * 30;

// Note that the session cookie isn't represented here; it's handled independently
// by the `@prairielearn/session` package, which has built-in support for migrating
// from one cookie name to another.
const COOKIES_TO_MIGRATE = [
  {
    oldName: 'pl_authn',
    newName: 'pl2_authn',
    options: {
      maxAge: config.authnCookieMaxAgeMilliseconds,
      httpOnly: true,
    },
  },
  {
    oldName: 'pl_access_as_administrator',
    newName: 'pl2_access_as_administrator',
    options: {
      maxAge: THIRTY_DAYS_IN_MILLISECONDS,
    },
  },
  {
    oldName: 'pl_assessmentpw',
    newName: 'pl2_assessmentpw',
    options: {
      // 12 hours, matches the value in `pages/authPassword`.
      maxAge: 1000 * 60 * 60 * 12,
      httpOnly: true,
    },
  },
  {
    oldName: 'preAuthUrl',
    newName: 'pl2_pre_auth_url',
  },
  {
    oldName: 'pl_pw_origUrl',
    newName: 'pl2_pw_original_url',
  },
  {
    oldName: 'pl_disable_auto_authn',
    newName: 'pl2_disable_auto_authn',
  },
  {
    oldName: 'pl_requested_data_changed',
    newName: 'pl2_requested_data_changed',
    options: {
      maxAge: THIRTY_DAYS_IN_MILLISECONDS,
    },
  },
  {
    oldName: 'pl_requested_uid',
    newName: 'pl2_requested_uid',
    options: {
      maxAge: THIRTY_DAYS_IN_MILLISECONDS,
    },
  },
  {
    oldName: 'pl_requested_course_role',
    newName: 'pl2_requested_course_role',
    options: {
      maxAge: THIRTY_DAYS_IN_MILLISECONDS,
    },
  },
  {
    oldName: 'pl_requested_course_instance_role',
    newName: 'pl2_requested_course_instance_role',
    options: {
      maxAge: THIRTY_DAYS_IN_MILLISECONDS,
    },
  },
  {
    oldName: 'pl_requested_mode',
    newName: 'pl2_requested_mode',
    options: {
      maxAge: THIRTY_DAYS_IN_MILLISECONDS,
    },
  },
  {
    oldName: 'pl_requested_date',
    newName: 'pl2_requested_date',
    options: {
      maxAge: THIRTY_DAYS_IN_MILLISECONDS,
    },
  },
  {
    oldRegexp: /pl_authz_workspace_(\d+)/,
    oldPattern: 'pl_authz_workspace_$1',
    newRegexp: /pl2_authz_workspace_(\d+)/,
    newPattern: 'pl2_authz_workspace_$1',
    options: {
      maxAge: config.workspaceAuthzCookieMaxAgeMilliseconds,
      httpOnly: true,
    },
  },
];

export function makeCookieMigrationMiddleware(
  rewriteCookies: boolean,
): (req: Request, res: Response, next: NextFunction) => void {
  return function migrateCookiesIfNeededMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    let didMigrate = false;

    COOKIES_TO_MIGRATE.forEach((cookieMigration) => {
      if (cookieMigration.oldName) {
        // If the cookie was already migrated, we don't need to write anything
        // back to the client. However, we'll overwrite the value of the old
        // cookie in the current request so that application code is
        // forward-compatible with the new cookie name.
        if (req.cookies[cookieMigration.newName]) {
          req.cookies[cookieMigration.oldName] = req.cookies[cookieMigration.newName];
          return;
        }

        // If the old cookie isn't present, there's nothing to do.
        if (!(cookieMigration.oldName in req.cookies)) return;

        // Rewrite the cookie for the current request in case we're configured to
        // not propagate renames back to the client yet.
        req.cookies[cookieMigration.newName] = req.cookies[cookieMigration.oldName];

        if (rewriteCookies) {
          didMigrate = true;
          res.cookie(cookieMigration.newName, req.cookies[cookieMigration.oldName], {
            ...(cookieMigration.options ?? {}),
            secure: shouldSecureCookie(req),
          });
        }
      } else if (cookieMigration.oldRegexp) {
        const { oldRegexp, oldPattern, newRegexp, newPattern } = cookieMigration;

        // First, if needed, rewrite old cookies to use the new names.
        const oldNames = req.cookies
          ? Object.keys(req.cookies).filter((cookieName) => oldRegexp.test(cookieName))
          : [];
        if (oldNames.length) {
          oldNames.forEach((oldName) => {
            const newName = oldName.replace(oldRegexp, newPattern);

            // If the cookie was already migrated, do nothing. We'll write this
            // new value to the old cookie name for the current request below.
            if (req.cookies[newName]) return;

            // Rewrite the cookie for the current request in case we're configured to
            // not propagate renames back to the client yet.
            req.cookies[newName] = req.cookies[oldName];

            if (rewriteCookies) {
              didMigrate = true;
              res.cookie(newName, req.cookies[oldName], {
                ...(cookieMigration.options ?? {}),
                secure: shouldSecureCookie(req),
              });
            }
          });
        }

        // Next, if we got any new cookies, overwrite the old cookies in the
        // current request so that application code is forward-compatible with
        // the new cookie names.
        const newNames = req.cookies
          ? Object.keys(req.cookies).filter((cookieName) => newRegexp.test(cookieName))
          : [];
        if (newNames.length) {
          newNames.forEach((newName) => {
            const oldName = newName.replace(newRegexp, oldPattern);
            req.cookies[oldName] = req.cookies[newName];
          });
        }
      }
    });

    if (didMigrate) {
      // Force the client to pick up the new cookies.
      res.redirect(307, req.originalUrl);
      return;
    }

    // The client doesn't have any cookies that need to be migrated.
    next();
  };
}
