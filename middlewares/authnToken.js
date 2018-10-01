const ERR = require('async-stacktrace');
const crypto = require('crypto');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const logger = require('../lib/logger');

const sql = sqlLoader.loadSqlEquiv(__filename);

const respondWithUnauthorized = (res) => {
    res.send(401, {
        message: 'You must authenticate to use this API',
    });
};

module.exports = (req, res, next) => {
    let token;
    if (req.query.private_token !== undefined) {
        // Token was provided in a query param
        token = req.query.private_token;
    } else if (req.header('Private-Token') !== undefined) {
        // Token was provided in a header
        token = req.header('Private-Token');
    } else {
        // No authorization token sent
        respondWithUnauthorized(res);
        return;
    }

    const params = {
        token_hash: crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
    };

    sqldb.queryZeroOrOneRow(sql.select_user_from_token_hash, params, (err, result) => {
        if (ERR(err, next)) return;
        if (result.rows.length === 0) {
            respondWithUnauthorized(res);
        } else {
            // Nice, we got a user
            res.locals.authn_user = result.rows[0].user;
            res.locals.is_administrator = result.rows[0].is_administrator;

            // Let's note that this token was used, but don't wait for this
            // to continue handling the request
            next();

            const lastUsedParams = {
                token_id: result.rows[0].token_id,
            };
            sqldb.query(sql.update_token_last_used, lastUsedParams, (err) => {
                if (ERR(err, (e) => logger.error(e)));
            });
        }
    });
};
