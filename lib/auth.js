const ERR = require('async-stacktrace');
const debug = require('debug')('prairielearn:authLib');
const csrf = require('./csrf');
const config = require('./config');

const { sqldb, sqlLoader } = require('@prairielearn/prairielib');
const sql = sqlLoader.loadSqlEquiv(__filename);

const authLib = {};

authLib.set_pl_authn = function(res, params, callback) {

    debug(params);

    let sqlParams = [
        params.uid || '',
        params.name || '',
        params.uin || '',
        params.provider || '',
    ];

    sqldb.call('users_select_or_insert', sqlParams, (err, result) => {
        if (ERR(err, callback)) return;
        debug(result.rows);
        var user = result.rows[0];
        const tokenData = {
            user_id: user.user_id,
            authn_provider_name: params.provider,
        };
        debug('tokenData', tokenData);
        const pl_authn = csrf.generateToken(tokenData, config.secretKey);
        res.cookie('pl_authn', pl_authn, {maxAge: 24 * 60 * 60 * 1000});
        callback(null, user, tokenData);
    });
};

authLib.devmodeLogin = function(req, res, callback) {
    let params = {
        uid: 'dev@illinois.edu',
        name: 'Dev User',
        uin: '000000000',
        provider: 'dev',
    };

    if (req.cookies.pl_test_user == 'test_student') {
        params.uid = 'student@illinois.edu';
        params.name = 'Student User';
        params.uin = '000000001';
    }

    authLib.set_pl_authn(res, params, (err, user, authnToken) => {
        if (ERR(err, callback)) return;
        authLib.set_locals_authn(res, authnToken, callback);
    });
};

authLib.set_locals_authn = function(res, authnData, callback) {

    let params = {
        user_id: authnData.user_id,
    };
    sqldb.query(sql.select_user, params, (err, result) => {
        if (ERR(err, callback)) return;
        if (result.rowCount == 0) return callback(new Error('user not found with user_id ' + authnData.user_id));
        let user = result.rows[0];
        res.locals.authn_user = user.user;
        res.locals.authn_institution = user.institution;
        res.locals.authn_provider_name = authnData.authn_provider_name;
        res.locals.is_administrator = user.is_administrator;
        res.locals.news_item_notification_count = user.news_item_notification_count;
        callback(null);
    });
};

module.exports = authLib;
