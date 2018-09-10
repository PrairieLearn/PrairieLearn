const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const uuidv4 = require('uuid/v4');

const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.post('/', (req, res, next) => {
    if (req.body.__action === 'token_generate') {
        const name = req.body.token_name;
        const token = uuidv4();
        const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

        const params = [
            res.locals.authn_user.user_id,
            name,
            // The token will only be persisted until the next page render
            // After that, we'll remove it from the database
            token,
            tokenHash,
        ];
        sqldb.call('access_tokens_insert', params, (err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action === 'token_delete') {
        const params = [
            req.body.token_id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('access_tokens_delete', params, (err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

router.get('/', (req, res, next) => {
    const params = {
        user_id: res.locals.authn_user.user_id,
    };
    sqldb.query(sql.select_access_tokens, params, (err, result) => {
        if (ERR(err, next)) return;

        // If the raw tokens are present for any of these hashes, include them
        // in this response and then delete them from memory
        const newAccessTokens = [];
        result.rows.forEach((row) => {
            if (row.token) {
                newAccessTokens.push(row.token);
            }
        });

        res.locals.accessTokens = result.rows;
        res.locals.newAccessTokens = newAccessTokens;

        // Now that we've rendered these tokens, remove any tokens from the DB
        sqldb.query(sql.clear_tokens_for_user, params, (err) => {
            if (ERR(err, next)) return;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    });
});

module.exports = router;
