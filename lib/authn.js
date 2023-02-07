const config = require('../lib/config');
const csrf = require('../lib/csrf');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

// authnParams { uid, name, uin }
// pl_authn_cookie
module.exports.load_user_profile =
    async (req, res, authnParams, authn_provider_name, pl_authn_cookie=true) => {

    let user_id;
    if ('user_id' in authnParams) {
        user_id = authnParams.user_id;
    } else {

        let params = [
            authnParams.authUid,
            authnParams.authName,
            authnParams.authUin,
            authn_provider_name
        ];

        let userSelectOrInsertRes = await sqldb.callAsync('users_select_or_insert', params);

        user_id = userSelectOrInsertRes.rows[0].user_id;
    }

    let selectUserRes = await sqldb.queryAsync(sql.select_user, {user_id});

    if (selectUserRes.rowCount === 0) {
        throw new Error('user not found with user_id ' + user_id);
    }
    res.locals.authn_user = selectUserRes.rows[0].user;
    res.locals.authn_institution = selectUserRes.rows[0].institution;
    res.locals.authn_provider_name = authn_provider_name;
    res.locals.authn_is_administrator = selectUserRes.rows[0].is_administrator;
    res.locals.authn_is_instructor = selectUserRes.rows[0].is_instructor;

    //checkAdministratorAccess(req, res);
    const defaultAccessType = res.locals.devMode ? 'active' : 'inactive';
    const accessType = req.cookies.pl_access_as_administrator || defaultAccessType;
    res.locals.access_as_administrator = accessType === 'active';
    res.locals.is_administrator = res.locals.authn_is_administrator && res.locals.access_as_administrator;

    res.locals.news_item_notification_count = selectUserRes.rows[0].news_item_notification_count;

    if (pl_authn_cookie) {
        // reset cookie timeout (#2268)
        var tokenData = {
            user_id: user_id,
            authn_provider_name: authn_provider_name || null,
        };
        var pl_authn = csrf.generateToken(tokenData, config.secretKey);
        res.cookie('pl_authn', pl_authn, {
            maxAge: config.authnCookieMaxAgeMilliseconds,
            httpOnly: true,
            secure: true,
        });
    }
};
/*
function checkAdministratorAccess(req, res) {
    const defaultAccessType = res.locals.devMode ? 'active' : 'inactive';
    const accessType = req.cookies.pl_access_as_administrator || defaultAccessType;
    res.locals.access_as_administrator = accessType === 'active';
    res.locals.is_administrator =
        res.locals.authn_is_administrator && res.locals.access_as_administrator;
}
*/