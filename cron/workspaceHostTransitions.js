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
    const running_host_set = new Set();
    const reservations = (await ec2.describeInstances({
        Filters: [
            {
                Name: 'tag-key',
                Values: [config.workspaceLoadLaunchTag],
            },
            {
                Name: 'instance-state-name',
                Values: [ 'pending', 'running' ],
            },
        ],
        MaxResults: 500,
    }).promise()).Reservations;
    for (const reservation of reservations) {
        for (const instance of Object.values(reservation.Instances)) {
            running_host_set.add(instance.InstanceId);
        }
    }

    const db_hosts_nonterminated = new Set((await sqldb.queryAsync(sql.select_nonterminated_workspace_hosts, [])).rows.map(instance => instance.instance_id));

    const set_difference = (a, b) => {
        const diff = new Set();
        for (const val of a) {
            if (!b.has(val)) {
                diff.add(val);
            }
        }
        return diff;
    };

    /* Kill off any host that is running but not in the db */
    const not_in_db = set_difference(running_host_set, db_hosts_nonterminated);
    if (not_in_db.size > 0) {
        logger.debug('Terminating hosts that are not in the database', Array.from(not_in_db));
        await sqldb.queryAsync(sql.add_terminating_hosts, { instances: Array.from(not_in_db) });
        await ec2.terminateInstances({ InstanceIds: Array.from(not_in_db) }).promise();
    }

    /* Any host that is in the db but not running we will mark as "terminated" */
    const not_in_ec2 = set_difference(db_hosts_nonterminated, running_host_set);
    if (not_in_ec2.size > 0) {
        logger.debug('Terminating hosts that are not running in EC2', Array.from(not_in_ec2));
        await sqldb.queryAsync(sql.set_terminated_hosts_if_not_launching, { instances: Array.from(not_in_ec2) });
    }
}

async function terminateHosts() {
    const ec2 = new AWS.EC2();
    const params = [
        config.workspaceHostUnhealthyTimeoutSec,
        config.workspaceHostLaunchTimeoutSec,
    ];
    const hosts = (await sqldb.callAsync('workspace_hosts_find_terminable', params)).rows[0].terminable_hosts || [];
    if (hosts.length > 0) {
        logger.debug('Found terminable hosts', hosts);
        await ec2.terminateInstances({ InstanceIds: hosts }).promise();
    }
}

async function checkHealth() {
    const db_hosts = (await sqldb.queryAsync(sql.select_healthy_hosts, [])).rows;
    await async.each(db_hosts, async (host) => {
        const url = `http://${host.hostname}/status`;
        let healthy = true;
        if (host.hostname === null || host.hostname === 'null') {
            healthy = false;
        } else {
            try {
                await request({ uri: url, resolveWithFullResponse: true });
            } catch (err) {
                healthy = false;
                logger.info(`Could not reach host ${host.hostname}: ${err}`);
            }
        }

        if (!healthy) {
            logger.info(`Host ${host.hostname} (${host.instance_id}) is unhealthy!`);
            await sqldb.queryAsync(sql.set_host_unhealthy, { instance_id: host.instance_id });
        }
    });
}
