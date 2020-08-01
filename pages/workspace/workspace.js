const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const logger = require('../../lib/logger');
const workspace = require('../../lib/workspace');

const error = require('@prairielearn/prairielib/error');

router.get('/:workspace_id', (req, res, _next) => {
    const workspace_id = req.params.workspace_id;
    res.locals.workspace_id = workspace_id;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.get('/:workspace_id/:action', (req, res, next) => {
    const workspace_id = req.params.workspace_id;
    const action = req.params.action;

    if (action === 'reboot') {
        logger.info(`[workspace.js] Rebooting workspace ${workspace_id}.`);
        workspace.controlContainer(workspace_id, 'destroy', (err) => {
            if (ERR(err, next)) return;
            const state = 'stopped';
            workspace.updateState(workspace_id, state, (err) => {
                if (ERR(err, next)) return;
                res.redirect(`/workspace/${workspace_id}`);
            });
        });
    } else {
        return next(error.make(400, 'unknown action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
