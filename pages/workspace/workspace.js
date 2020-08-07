const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const logger = require('../../lib/logger');
const workspace = require('../../lib/workspace');

const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:workspace_id', (req, res, next) => {
    const workspace_id = req.params.workspace_id;
    sqldb.queryOneRowAsync(sql.select_question, {workspace_id}, (err, result) => {
        if (ERR(err, next)) return;
        const question_id = result.rows[0].question_id;
        const question_title = result.rows[0].question_title;
        res.locals.workspace_id = workspace_id;
        res.locals.question_id = question_id;
        res.locals.question_title = question_title;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.get('/:workspace_id/:action', asyncHandler(async (req, res, next) => {
    const workspace_id = req.params.workspace_id;
    const action = req.params.action;

    if (action === 'reboot') {
        logger.info(`[workspace.js] Rebooting workspace ${workspace_id}.`);
        const state = 'stopped';
        await workspace.updateState(workspace_id, state);
        res.redirect(`/workspace/${workspace_id}`);
    } else {
        return next(error.make(400, 'unknown action', {locals: res.locals, body: req.body}));
    }
}));

module.exports = router;
