const AWS = require('aws-sdk');
const { callbackify } = require('util');

const config = require('../lib/config');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.run = callbackify(async() => {
    if (!config.runningInEc2) return;

    const ec2 = new AWS.EC2();
    const running_hosts = await ec2.describeInstances({
        Filter: [
            {
                Name: 'tag-key',
                Values: [config.workspaceLoadLaunchTag],
            },
        ],
        MaxResults: 500,
    }).promise();

    const db_hosts = (await sqldb.query(sql.select_nonstopped_workspace_hosts, [])).rows;

    console.log(running_hosts);
    console.log(db_hosts);
});
