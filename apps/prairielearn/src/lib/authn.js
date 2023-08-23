// @ts-check
const { z } = require('zod');
const sqldb = require('@prairielearn/postgres');
const { generateSignedToken } = require('@prairielearn/signed-token');

const { config } = require('../lib/config');
const { shouldSecureCookie } = require('../lib/cookie');
const { InstitutionSchema, UserSchema } = require('./db-types');

const sql = sqldb.loadSqlEquiv(__filename);

/**
 * @typedef {Object} LoadUserOptions
 * @property {boolean} [pl_authn_cookie] - Create the cookie?
 * @property {boolean} [redirect] - Redirect after processing?
 */
/**
 * @typedef {Object} LoadUserAuth
 * @property {string} [uid]
 * @property {string | null} [uin]
 * @property {string | null} [name]
 * @property {string} [provider]
 * @property {number} [user_id] - If present, skip the users_select_or_insert call
 * @property {number | string | null} [institution_id]
 */
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {LoadUserAuth} authnParams
 * @param {LoadUserOptions} [optionsParams]
 */
module.exports.loadUser = async (req, res, authnParams, optionsParams = {}) => {
  let options = { pl_authn_cookie: true, redirect: false, ...optionsParams };

  let user_id;
  if ('user_id' in authnParams) {
    user_id = authnParams.user_id;
  } else {
    let params = [
      authnParams.uid,
      authnParams.name,
      authnParams.uin,
      authnParams.provider,
      authnParams.institution_id,
    ];

    let userSelectOrInsertRes = await sqldb.callAsync('users_select_or_insert', params);

    user_id = userSelectOrInsertRes.rows[0].user_id;
  }

  const selectedUser = await sqldb.queryOptionalRow(
    sql.select_user,
    { user_id },
    z.object({
      user: UserSchema,
      institution: InstitutionSchema,
      is_administrator: z.boolean(),
      is_instructor: z.boolean(),
      news_item_notification_count: z.number(),
    }),
  );

  if (!selectedUser) {
    throw new Error('user not found with user_id ' + user_id);
  }

  if (options.pl_authn_cookie) {
    var tokenData = {
      user_id: user_id,
      authn_provider_name: authnParams.provider || null,
    };
    var pl_authn = generateSignedToken(tokenData, config.secretKey);
    res.cookie('pl_authn', pl_authn, {
      maxAge: config.authnCookieMaxAgeMilliseconds,
      httpOnly: true,
      secure: shouldSecureCookie(req),
    });

    // After explicitly authenticating, clear the cookie that disables
    // automatic authentication.
    res.clearCookie('pl_disable_auto_authn');
  }

  if (options.redirect) {
    let redirUrl = res.locals.homeUrl;
    if ('preAuthUrl' in req.cookies) {
      redirUrl = req.cookies.preAuthUrl;
      res.clearCookie('preAuthUrl');
    }
    res.redirect(redirUrl);
    return;
  }

  // If we fall-through here, set the res.locals.authn_user variables (middleware)

  res.locals.authn_user = selectedUser.user;
  res.locals.authn_institution = selectedUser.institution;
  res.locals.authn_provider_name = authnParams.provider;
  res.locals.authn_is_administrator = selectedUser.is_administrator;
  res.locals.authn_is_instructor = selectedUser.is_instructor;

  const defaultAccessType = res.locals.devMode ? 'active' : 'inactive';
  const accessType = req.cookies.pl_access_as_administrator || defaultAccessType;
  res.locals.access_as_administrator = accessType === 'active';
  res.locals.is_administrator =
    res.locals.authn_is_administrator && res.locals.access_as_administrator;

  res.locals.news_item_notification_count = selectedUser.news_item_notification_count;
};
