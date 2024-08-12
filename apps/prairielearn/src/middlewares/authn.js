// @ts-check
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';
import { getCheckedSignedTokenData } from '@prairielearn/signed-token';

import * as authnLib from '../lib/authn.js';
import { config } from '../lib/config.js';
import { clearCookie, setCookie } from '../lib/cookie.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const UUID_REGEXP = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default asyncHandler(async (req, res, next) => {
  res.locals.is_administrator = false;
  res.locals.news_item_notification_count = 0;

  if (req.method === 'OPTIONS') {
    // don't authenticate for OPTIONS requests, as these are just for CORS
    next();
    return;
  }

  if (/^\/pl\/webhooks\//.test(req.path)) {
    // Webhook callbacks should not be authenticated
    next();
    return;
  }

  if (/^\/pl\/api\//.test(req.path)) {
    // API calls will be authenticated outside this normal flow using tokens
    next();
    return;
  }

  // look for load-testing override cookie
  if (req.cookies.load_test_token) {
    const data = getCheckedSignedTokenData(req.cookies.load_test_token, config.secretKey, {
      maxAge: 24 * 60 * 60 * 1000,
    });

    if (!data || !data.uuid || typeof data.uuid !== 'string' || !data.uuid.match(UUID_REGEXP)) {
      throw new Error('invalid load_test_token');
    }

    const uuid = data.uuid;

    let authnParams = {
      uid: `loadtest+${uuid}@prairielearn.com`,
      uin: `loadtest+${uuid}`,
      name: `Load Test ${uuid}`,
      provider: 'LoadTest',
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: false,
    });

    // Enroll the load test user in the example course.
    await sqldb.queryAsync(sql.enroll_user_in_example_course, {
      user_id: res.locals.authn_user.user_id,
    });

    return next();
  }

  // In dev mode, by default, we'll authenticate the user automatically using
  // the UID, name, and UIN specified in the config. This is to reduce the
  // friction of getting started with PrairieLearn.
  //
  // If an authentication cookie is already present, we won't set a new one.
  //
  // If the user clicks "Log out" in dev mode, we'll set a special cookie to
  // prevent this automatic authentication. The user will get bounced to the
  // login page like they would in production. They then have two options:
  //
  // - Use the "bypass" authentication option on the login page to log in as
  //   the user configured by `config.authUid` etc (see `pages/authLoginDev`).
  // - Log in as a specific UID/name/UIN (see `pages/authLogin`).
  if (config.devMode && !req.cookies.pl2_disable_auto_authn && req.session.user_id == null) {
    var uid = config.authUid;
    var name = config.authName;
    var uin = config.authUin;

    // We allow unit tests to override the user. Unit tests may also override the req_date
    // (middlewares/date.js) and the req_mode (middlewares/authzCourseOrInstance.js).
    if (req.cookies.pl_test_user === 'test_student') {
      uid = 'student@example.com';
      name = 'Student User';
      uin = '000000001';
    } else if (req.cookies.pl_test_user === 'test_instructor') {
      uid = 'instructor@example.com';
      name = 'Instructor User';
      uin = '100000000';
    }

    if (!uid) throw new Error('Missing uid');

    let authnParams = {
      uid,
      uin,
      name,
      provider: 'dev',
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: false,
    });
    return next();
  }

  if (req.session.user_id == null || req.session.authn_provider_name == null) {
    // The user is not authenticated.

    // Clear the auth cookie in case it was bad
    clearCookie(res, ['pl_authn', 'pl2_authn']);

    // If we're in the middle of a PrairieTest login flow, propagate that to
    // the login page so we can show a message to the user.
    let query = '';
    if (req.path === '/pl/prairietest/auth') {
      query = '?service=PrairieTest';
    }

    const loginUrl = `/pl/login${query}`;

    // If this request is being made by HTMX, use the special `HX-Redirect`
    // header to redirect the page as a whole, not just the response.
    if (req.get('HX-Request')) {
      // Instead of redirecting to `req.originalUrl`, we redirect back to the
      // page from which the HTMX request was made. This ensures that users
      // don't end up redirected to a route that renders HTML that's meant to
      // be embedded in another page.
      //
      // Fall back to the home page if we're somehow missing this header.
      setCookie(res, ['preAuthUrl', 'pl2_pre_auth_url'], req.get('HX-Current-URL') ?? '/pl');
      res.set('HX-Redirect', loginUrl);

      // Note that Node doesn't allow us to set headers if the response is a
      // redirect, so we send this as a 200 response. HTMX will perform the
      // redirect on the client.
      //
      // https://stackoverflow.com/questions/39997413/how-to-pass-headers-while-doing-res-redirect-in-express-js
      res.send();
      return;
    }

    // first set the preAuthUrl cookie for redirection after authn
    setCookie(res, ['preAuthUrl', 'pl2_pre_auth_url'], req.originalUrl);

    res.redirect(loginUrl);
    return;
  }

  let authnParams = {
    user_id: req.session.user_id,
    provider: req.session.authn_provider_name,
  };

  await authnLib.loadUser(req, res, authnParams, {
    redirect: false,
  });

  next();
});
