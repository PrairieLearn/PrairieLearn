const AWS = require('aws-sdk');
const { callbackify } = require('util');

const logger = require('../lib/logger');
const config = require('../lib/config');
const request = require('request-promise-native');
const async = require('async');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.run = callbackify(async() => {
    if (!config.runningInEc2) return;

    await checkDBConsistency();
    await terminateHosts();
    await checkHealth();
});

async function checkDBConsistency() {
    /* Attempt to make the list of hosts in EC2 consistent with what
       we see in the database. */

    const ec2 = new AWS.EC2();
    const running_hosts = (await ec2.describeInstances({
        Filters: [
            {
                Name: 'tag-key',
                Values: [config.workspaceLoadLaunchTag],
            },
        ],
        MaxResults: 500,
    }).promise()).data.Reservations.Instances.map(instance => instance.InstanceId);
    const running_host_set = new Set(running_hosts);

    const db_hosts = (await sqldb.queryAsync(sql.select_nonstopped_workspace_hosts, [])).rows.map(instance => instance.instance_id);
    const db_hosts_set = new Set(db_hosts);

    const set_difference = (a, b) => {
        const diff = new Set();
        for (const val of a) {
            if (!b.has(val)) {
                diff.add(val);
            }
        }
    };

    /* Kill off any host that is running but not in the db */
    const not_in_db = set_difference(running_host_set, db_hosts_set);
    await sqldb.queryAsync(sql.add_terminating_hosts, { instances: Array.from(not_in_db) });
    await ec2.terminateInstances({ InstanceIds: Array.from(not_in_db) }).promise();

    /* Any host that is in the db but not running we will mark as "terminated" */
    const not_in_ec2 = set_difference(db_hosts_set, running_host_set);
    await sqldb.queryAsync(sql.set_terminated_hosts, { instances: Array.from(not_in_ec2) });
}

async function terminateHosts() {
    const ec2 = new AWS.EC2();
    const params = [
        config.workspaceHostUnhealthyTimeoutSec,
        config.workspaceHostLaunchTimeoutSec,
    ];
    const hosts = (await sqldb.callAsync('workspace_hosts_find_terminable', params)).rows[0].terminated_hosts || [];
    await ec2.terminateInstances({ InstanceIds: hosts }).promise();
}

async function checkHealth() {
    const db_hosts = (await sqldb.queryAsync(sql.select_nonstopped_workspace_hosts, [])).rows;
    await async.each(db_hosts, async (host) => {
        const url = `${host.hostname}/status`;
        let healthy = true;
        let response;
        try {
            response = await request(url);
        } catch (err) {
            healthy = false;
        }
        if (response.statusCode !== 200) {
            healthy = false;
        }
        logger.info(`Host ${host.hostname} ($host.instance_id) is unhealthy!`);

        if (!healthy) {
            await sqldb.queryOneRowAsync(sql.set_host_unhealthy, { instance_id: host.instance_id });
        }
    });
}
