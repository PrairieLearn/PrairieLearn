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
            heartbeat_timeout_sec: config.workspaceHeartbeatTimeoutSec,
        };
        const result = await sqldb.queryAsync(sql.select_stale_workspaces, params);
        const staleWorkspaces = result.rows;
        for (const staleWorkspace of staleWorkspaces) {
            logger.verbose(`stopStaleWorkspaces: stopping workspace_id = ${workspace.id}`);
            await workspaceHelper.updateState(staleWorkspace.id, 'stopped', 'Cron job');
        }
    })(callback);
};
