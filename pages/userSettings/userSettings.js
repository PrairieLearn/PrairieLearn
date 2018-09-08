const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const uuidv4 = require('uuid/v4');

const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

// Poor man's flash messages: we'll maintain a mapping from hashes to tokens
// between the POST that creates the token and the GET that renders it.
// Immediately after rendering it on the GET request, we'll delete it from
// this dict.
const hashTokenMap = {};

router.post('/', (req, res, next) => {
    if (req.body.__action === 'token_generate') {
        const name = req.body.token_name;
        const token = uuidv4();
        const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

        const params = {
            user_id: res.locals.authn_user.user_id,
            name,
            token_hash: tokenHash,
        };
        sqldb.queryOneRow(sql.insert_access_token, params, (err) => {
            if (ERR(err, next)) return;
            // If this was successful, persist the token temporarily
            hashTokenMap[tokenHash] = token;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action === 'token_delete') {
        const params = {
            user_id: res.locals.authn_user.user_id,
            id: req.body.token_id,
        };
        sqldb.query(sql.delete_access_token, params, (err) => {
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
        let newAccessToken;
        result.rows.forEach((row) => {
            if (row.token_hash in hashTokenMap) {
                newAccessToken = hashTokenMap[row.token_hash];
                // delete hashTokenMap[row.token_hash];
            }
        });

        res.locals.accessTokens = result.rows;
        res.locals.newAccessToken = newAccessToken;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
