// @ts-check
const { config } = require('../lib/config');
const { generateSignedToken } = require('@prairielearn/signed-token');
const sqldb = require('@prairielearn/postgres');

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
    let params = [authnParams.uid, authnParams.name, authnParams.uin, authnParams.provider];

    let userSelectOrInsertRes = await sqldb.callAsync('users_select_or_insert', params);

    user_id = userSelectOrInsertRes.rows[0].user_id;
  }

  let selectUserRes = await sqldb.queryAsync(sql.select_user, { user_id });

  if (selectUserRes.rowCount === 0) {
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
      secure: true,
    });
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

  res.locals.authn_user = selectUserRes.rows[0].user;
  res.locals.authn_institution = selectUserRes.rows[0].institution;
  res.locals.authn_provider_name = authnParams.provider;
  res.locals.authn_is_administrator = selectUserRes.rows[0].is_administrator;
  res.locals.authn_is_instructor = selectUserRes.rows[0].is_instructor;

  const defaultAccessType = res.locals.devMode ? 'active' : 'inactive';
  const accessType = req.cookies.pl_access_as_administrator || defaultAccessType;
  res.locals.access_as_administrator = accessType === 'active';
  res.locals.is_administrator =
    res.locals.authn_is_administrator && res.locals.access_as_administrator;

  res.locals.news_item_notification_count = selectUserRes.rows[0].news_item_notification_count;
};
