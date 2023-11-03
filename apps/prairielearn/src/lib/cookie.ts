import type { Request, Response, NextFunction } from 'express';

import { config } from './config';

function findLast<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      return arr[i];
    }
  }
  return undefined;
}

export function shouldSecureCookie(req: Request): boolean {
  // In production, always set secure: true. Otherwise, only set it to true if
  // the request is made over HTTPS.
  //
  // `req.protocol` should reflect Express' `trust proxy` setting, which should
  // be used when the app is behind a reverse proxy or load balancer.
  return !config.devMode || req.protocol === 'https';
}

const COOKIES_TO_MIGRATE = [
  {
    oldNames: ['pl_authn'],
    newName: 'pl2_authn',
    options: {
      maxAge: config.authnCookieMaxAgeMilliseconds,
      httpOnly: true,
    },
  },
  {
    oldNames: ['pl_assessmentpw'],
    newName: 'pl2_assessmentpw',
    options: {
      // 12 hours, matches the value in `pages/authPassword`.
      maxAge: 1000 * 60 * 60 * 12,
      httpOnly: true,
    },
  },
  {
    oldNames: ['preAuthUrl'],
    newName: 'pl2_pre_auth_url',
  },
  {
    oldNames: ['pl_pw_origUrl'],
    newName: 'pl2_pw_original_url',
  },
  {
    oldNames: ['pl_disable_auto_authn'],
    newName: 'pl2_disable_auto_authn',
  },
  {
    oldNames: ['pl_requested_data_changed'],
    newName: 'pl2_requested_data_changed',
  },
  {
    oldNames: ['pl_requested_uid'],
    newName: 'pl2_requested_uid',
  },
  {
    oldNames: ['pl_requested_course_role'],
    newName: 'pl2_requested_course_role',
  },
  {
    oldNames: ['pl_requested_course_instance_role'],
    newName: 'pl2_requested_course_instance_role',
  },
  {
    oldNames: ['pl_requested_mode'],
    newName: 'pl2_requested_mode',
  },
  {
    oldNames: ['pl_requested_date'],
    newName: 'pl2_requested_date',
  },
  {
    oldRegexp: /pl_authz_workspace_(\d+)/,
    newPattern: 'pl2_authz_workspace_$1',
    options: {
      maxAge: config.workspaceAuthzCookieMaxAgeMilliseconds,
      httpOnly: true,
    },
  },
];

export function migrateCookiesIfNeededMiddleware(req: Request, res: Response, next: NextFunction) {
  let didMigrate = false;
  COOKIES_TO_MIGRATE.forEach((cookieMigration) => {
    if (cookieMigration.oldNames) {
      const sourceCookieName = findLast(cookieMigration.oldNames, (cookieName) => {
        return cookieName in req.cookies;
      });
      if (!sourceCookieName) return;

      // If the cookie was already migrated, do nothing.
      if (req.cookies[cookieMigration.newName]) return;

      didMigrate = true;
      res.cookie(cookieMigration.newName, req.cookies[sourceCookieName], {
        ...(cookieMigration.options ?? {}),
        secure: shouldSecureCookie(req),
      });
    } else if (cookieMigration.oldRegexp) {
      const { oldRegexp, newPattern } = cookieMigration;
      const oldNames = req.cookies
        ? Object.keys(req.cookies).filter((cookieName) => oldRegexp.test(cookieName))
        : [];
      if (oldNames.length) {
        oldNames.forEach((oldName) => {
          const newName = oldName.replace(oldRegexp, newPattern);

          // If the cookie was already migrated, do nothing.
          if (req.cookies[newName]) return;

          didMigrate = true;
          res.cookie(newName, req.cookies[oldName], {
            ...cookieMigration.options,
            secure: shouldSecureCookie(req),
          });
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
}
