const util = require('util');

const config = require('../lib/config');
const logger = require('../lib/logger');
const workspaceHelper = require('../lib/workspace');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.run = function(callback) {
    util.callbackify(async () => {
        const params = {
            launched_timeout_sec: config.workspaceLaunchedTimeoutSec,
            launched_timeout_warn_sec: config.workspaceLaunchedTimeoutWarnSec,
        };
        const result = await sqldb.queryAsync(sql.select_almost_launched_timeout_workspaces, params);
        const workspaces = result.rows;
        for (const workspace of workspaces) {
            const launched_at = new Date(workspace.launched_at);
            const timeout_at = new Date(launched_at.getTime() + config.workspaceLaunchedTimeoutSec * 1000);
            const time_to_timeout_min = (timeout_at - Date.now()) / 1000 / 60;
            logger.verbose(`workspaceTimeoutWarn: timeout warning for workspace_id = ${workspace.id}`);
            await workspaceHelper.updateMessage(workspace.id, `WARNING: This workspace will stop in < ${Math.ceil(time_to_timeout_min)} min. Click "Reboot" to keep working.`);
        }
    })(callback);
};
