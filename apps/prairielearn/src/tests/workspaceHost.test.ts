import { assert } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import * as sqldb from '@prairielearn/postgres';

import * as workspaceHostUtils from '../lib/workspaceHost';
import * as helperDb from './helperDb';

const WorkspaceHostSchema = z.object({
  id: z.string(),
  instance_id: z.string(),
  state: z.string(),
});

const WorkspaceHostLogsSchema = z.object({
  id: z.string(),
  workspace_host_id: z.string(),
  message: z.string(),
  state: z.string(),
});

const WorkspaceSchema = z.object({
  id: z.string(),
  state: z.string(),
  workspace_host_id: z.string().nullable(),
});

const WorkspaceLogsSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  state: z.string().nullable(),
  message: z.string().nullable(),
});

async function insertWorkspaceHost(id: string | number, state = 'launching') {
  return sqldb.queryRow(
    'INSERT INTO workspace_hosts (id, instance_id, state) VALUES ($id, $instance_id, $state) RETURNING *;',
    {
      id,
      instance_id: uuidv4(),
      state,
    },
    WorkspaceHostSchema,
  );
}

async function insertWorkspace(
  id: string | number,
  hostId: string | number | null | undefined = null,
) {
  return sqldb.queryRow(
    'INSERT INTO workspaces (id, state, workspace_host_id) VALUES ($id, $state, $workspace_host_id) RETURNING *;',
    {
      id,
      state: 'launching',
      workspace_host_id: hostId,
    },
    WorkspaceSchema,
  );
}

async function selectWorkspaceHost(id) {
  return sqldb.queryRow(
    'SELECT * FROM workspace_hosts WHERE id = $id;',
    { id },
    WorkspaceHostSchema,
  );
}

async function selectWorkspace(id) {
  return sqldb.queryRow('SELECT * FROM workspaces WHERE id = $id;', { id }, WorkspaceSchema);
}

/**
 * Returns the workspace host logs for the given host.
 */
async function getWorkspaceHostLogs(id: string | number) {
  return sqldb.queryRows(
    'SELECT * FROM workspace_host_logs WHERE workspace_host_id = $id;',
    { id },
    WorkspaceHostLogsSchema,
  );
}

async function getWorkspaceLogs(id: string | number) {
  return sqldb.queryRows(
    'SELECT * FROM workspace_logs WHERE workspace_id = $id;',
    { id },
    WorkspaceLogsSchema,
  );
}

describe('workspaceHost utilities', function () {
  before(async () => {
    await helperDb.before.call(this);
  });

  after(async () => {
    await helperDb.after.call(this);
  });

  beforeEach(async () => {
    await sqldb.queryAsync('DELETE FROM workspaces;', {});
    await sqldb.queryAsync('DELETE FROM workspace_hosts;', {});
    await sqldb.queryAsync('DELETE FROM workspace_host_logs;', {});
  });

  describe('markWorkspaceHostUnhealthy()', () => {
    it('should mark a host as unhealthy', async () => {
      await insertWorkspaceHost(1);
      await insertWorkspaceHost(2);

      const host = await workspaceHostUtils.markWorkspaceHostUnhealthy('1', 'test');

      // First host should be marked as unhealthy
      assert.equal(host.state, 'unhealthy');

      const logs = await getWorkspaceHostLogs(1);
      assert.lengthOf(logs, 1);

      const log = logs[0];
      assert.equal(log.workspace_host_id, '1');
      assert.equal(log.message, 'test');
      assert.equal(log.state, 'unhealthy');

      // Second workspace host should be unaffected
      const secondHost = await selectWorkspaceHost(2);
      assert.equal(secondHost.state, 'launching');

      const secondLogs = await getWorkspaceHostLogs(2);
      assert.lengthOf(secondLogs, 0);
    });
  });

  describe('markAllWorkspaceHostsUnhealthy()', () => {
    it('should mark all hosts as unhealthy', async () => {
      await insertWorkspaceHost(1);
      await insertWorkspaceHost(2);

      const hosts = await workspaceHostUtils.markAllWorkspaceHostsUnhealthy('test');

      assert.isTrue(hosts.every((host) => host.state === 'unhealthy'));

      for (const id of ['1', '2']) {
        const logs = await getWorkspaceHostLogs(id);
        assert.lengthOf(logs, 1);

        const log = logs[0];
        assert.equal(log.workspace_host_id, id);
        assert.equal(log.message, 'test');
        assert.equal(log.state, 'unhealthy');
      }
    });
  });

  describe('assignWorkspaceToHost', () => {
    it('should assign a workspace to a host', async () => {
      await insertWorkspace(1);
      await insertWorkspaceHost(1, 'ready');

      const hostId = await workspaceHostUtils.assignWorkspaceToHost('1', 1);
      assert.equal(hostId, '1');

      const workspace = await selectWorkspace('1');
      assert.equal(workspace.workspace_host_id, '1');

      const workspaceLogs = await getWorkspaceLogs(1);
      assert.lengthOf(workspaceLogs, 1);
      assert.equal(workspaceLogs[0].state, 'launching');
      assert.equal(workspaceLogs[0].message, 'Assigned to host 1');

      const workspaceHostLogs = await getWorkspaceHostLogs(1);
      assert.lengthOf(workspaceHostLogs, 1);
      assert.equal(workspaceHostLogs[0].state, 'ready');
      assert.equal(workspaceHostLogs[0].message, 'Assigned workspace 1');
    });

    it('should not assign a workspace to a host if it is unhealthy', async () => {
      await insertWorkspace(1);
      await insertWorkspaceHost(1, 'unhealthy');

      const hostId = await workspaceHostUtils.assignWorkspaceToHost('1', 1);
      assert.isNull(hostId);

      const workspace = await selectWorkspace('1');
      assert.isNull(workspace.workspace_host_id);

      assert.isEmpty(await getWorkspaceHostLogs(1));
      assert.isEmpty(await getWorkspaceLogs(1));
    });

    it('should not assign a workspace to a host if it is at capacity', async () => {
      await insertWorkspace(1);
      await insertWorkspaceHost(1, 'ready');

      // Set capacity to zero to simulate a full host.
      const hostId = await workspaceHostUtils.assignWorkspaceToHost('1', 0);
      assert.isNull(hostId);

      const workspace = await selectWorkspace('1');
      assert.isNull(workspace.workspace_host_id);

      assert.isEmpty(await getWorkspaceHostLogs(1));
      assert.isEmpty(await getWorkspaceLogs(1));
    });
  });

  describe('recaptureDrainingWorkspaceHosts', () => {
    it('recaptures the specified number of draining hosts', async () => {
      await insertWorkspaceHost(1, 'draining');
      await insertWorkspaceHost(2, 'draining');
      await insertWorkspaceHost(3, 'draining');
      await insertWorkspaceHost(4, 'draining');

      const recaptured = await workspaceHostUtils.recaptureDrainingWorkspaceHosts(2);
      assert.equal(recaptured, 2);

      const hostLogs1 = await getWorkspaceHostLogs(1);
      assert.lengthOf(hostLogs1, 1);
      assert.equal(hostLogs1[0].state, 'ready');
      assert.equal(hostLogs1[0].message, 'Recaptured draining host');

      const hostLogs2 = await getWorkspaceHostLogs(2);
      assert.lengthOf(hostLogs2, 1);
      assert.equal(hostLogs2[0].state, 'ready');
      assert.equal(hostLogs2[0].message, 'Recaptured draining host');

      const hostLogs3 = await getWorkspaceHostLogs(3);
      assert.lengthOf(hostLogs3, 0);

      const hostLogs4 = await getWorkspaceHostLogs(4);
      assert.lengthOf(hostLogs4, 0);
    });

    it("doesn't recapture a host that is not draining", async () => {
      await insertWorkspaceHost(1, 'launching');
      await insertWorkspaceHost(2, 'ready');
      await insertWorkspaceHost(3, 'unhealthy');
      await insertWorkspaceHost(4, 'terminating');
      await insertWorkspaceHost(5, 'terminated');

      const recaptured = await workspaceHostUtils.recaptureDrainingWorkspaceHosts(1);
      assert.equal(recaptured, 0);
    });
  });

  describe('drainExtraWorkspaceHosts', () => {
    it('drains the specified number of hosts', async () => {
      await insertWorkspaceHost(1, 'ready');
      await insertWorkspaceHost(2, 'ready');
      await insertWorkspaceHost(3, 'ready');
      await insertWorkspaceHost(4, 'ready');

      await workspaceHostUtils.drainExtraWorkspaceHosts(2);

      const host1 = await selectWorkspaceHost('1');
      const host2 = await selectWorkspaceHost('2');
      const host3 = await selectWorkspaceHost('3');
      const host4 = await selectWorkspaceHost('4');

      // The oldest hosts should be marked as draining.
      assert.equal(host1.state, 'draining');
      assert.equal(host2.state, 'draining');
      assert.equal(host3.state, 'ready');
      assert.equal(host4.state, 'ready');

      const hostLogs1 = await getWorkspaceHostLogs(1);
      assert.lengthOf(hostLogs1, 1);
      assert.equal(hostLogs1[0].message, 'Draining extra host');

      const hostLogs2 = await getWorkspaceHostLogs(2);
      assert.lengthOf(hostLogs2, 1);
      assert.equal(hostLogs2[0].message, 'Draining extra host');

      const hostLogs3 = await getWorkspaceHostLogs(3);
      assert.lengthOf(hostLogs3, 0);

      const hostLogs4 = await getWorkspaceHostLogs(4);
      assert.lengthOf(hostLogs4, 0);
    });
  });

  describe('findTerminableWorkspaceHosts', () => {
    it('marks draining host with zero load as terminating', async () => {
      const host = await insertWorkspaceHost(1, 'draining');

      const hosts = await workspaceHostUtils.findTerminableWorkspaceHosts(0, 0);
      const hostLogs = await getWorkspaceHostLogs(1);

      assert.lengthOf(hosts, 1);
      assert.isDefined(hosts.find((h) => h.instance_id === host.instance_id));

      assert.lengthOf(hostLogs, 1);
      assert.equal(hostLogs[0].message, 'Terminating host');
    });

    it('marks unhealthy host with zero load as terminating', async () => {
      const host = await insertWorkspaceHost(1, 'unhealthy');

      const hosts = await workspaceHostUtils.findTerminableWorkspaceHosts(0, 0);
      assert.lengthOf(hosts, 1);
      assert.isDefined(hosts.find((h) => h.instance_id === host.instance_id));

      const hostLogs = await getWorkspaceHostLogs(1);
      assert.lengthOf(hostLogs, 1);
      assert.equal(hostLogs[0].message, 'Terminating host');
    });

    it('marks unhealthy host that exceeded timeout as terminating', async () => {
      const host1 = await insertWorkspaceHost(1, 'unhealthy');
      await sqldb.queryAsync(
        "UPDATE workspace_hosts SET unhealthy_at = NOW() - INTERVAL '1 hour', load_count = 5 WHERE id = $id;",
        { id: host1.id },
      );

      const host2 = await insertWorkspaceHost(2, 'unhealthy');
      await sqldb.queryAsync(
        "UPDATE workspace_hosts SET unhealthy_at = NOW() - INTERVAL '10 seconds', load_count = 5 WHERE id = $id;",
        { id: host2.id },
      );

      // Only the first host should be terminated; the second one hasn't
      // exceeded the unhealthy timeout yet.
      const hosts = await workspaceHostUtils.findTerminableWorkspaceHosts(60, 0);
      assert.lengthOf(hosts, 1);
      assert.isDefined(hosts.find((h) => h.instance_id === host1.instance_id));
      assert.isUndefined(hosts.find((h) => h.instance_id === host2.instance_id));

      const hostLogs1 = await getWorkspaceHostLogs(1);
      assert.lengthOf(hostLogs1, 1);
      assert.equal(hostLogs1[0].message, 'Terminating host');

      const hostLogs2 = await getWorkspaceHostLogs(2);
      assert.lengthOf(hostLogs2, 0);
    });

    it('marks launching host that exceeded timeout as terminating', async () => {
      const host1 = await insertWorkspaceHost(1, 'launching');
      await sqldb.queryAsync(
        "UPDATE workspace_hosts SET launched_at = NOW() - INTERVAL '1 hour', load_count = 5 WHERE id = $id;",
        { id: host1.id },
      );

      const host2 = await insertWorkspaceHost(2, 'launching');
      await sqldb.queryAsync(
        "UPDATE workspace_hosts SET launched_at = NOW() - INTERVAL '10 seconds', load_count = 5 WHERE id = $id;",
        { id: host2.id },
      );

      // Only the first host should be terminated; the second one hasn't
      // exceeded the launching timeout yet.
      const hosts = await workspaceHostUtils.findTerminableWorkspaceHosts(0, 60);
      assert.lengthOf(hosts, 1);
      assert.isDefined(hosts.find((h) => h.instance_id === host1.instance_id));
      assert.isUndefined(hosts.find((h) => h.instance_id === host2.instance_id));

      const hostLogs1 = await getWorkspaceHostLogs(1);
      assert.lengthOf(hostLogs1, 1);
      assert.equal(hostLogs1[0].message, 'Terminating host');

      const hostLogs2 = await getWorkspaceHostLogs(2);
      assert.lengthOf(hostLogs2, 0);
    });

    it('returns already-terminating hosts', async () => {
      await insertWorkspaceHost(1, 'terminating');

      const hosts = await workspaceHostUtils.findTerminableWorkspaceHosts(0, 0);
      assert.lengthOf(hosts, 1);

      // This host was already terminating, so there shouldn't be any logs.
      const hostLogs = await getWorkspaceHostLogs(1);
      assert.lengthOf(hostLogs, 0);
    });
  });

  describe('terminateWorkspaceHostsIfNotLaunching', () => {
    it('terminates hosts that are not launching', async () => {
      const host1 = await insertWorkspaceHost(1, 'launching');
      const host2 = await insertWorkspaceHost(2, 'ready');
      const host3 = await insertWorkspaceHost(3, 'unhealthy');

      // Place a workspace on each host.
      const workspace1 = await insertWorkspace(1, 1);
      const workspace2 = await insertWorkspace(2, 2);
      const workspace3 = await insertWorkspace(3, 3);

      const workspaces = await workspaceHostUtils.terminateWorkspaceHostsIfNotLaunching([
        host1.instance_id,
        host2.instance_id,
        host3.instance_id,
      ]);

      // Only the workspaces on hosts 2 and 3 should have been stopped;
      // host 1 is still launching.
      assert.lengthOf(workspaces, 2);
      assert.isUndefined(workspaces.find((w) => w.workspace_id === workspace1.id));
      assert.isDefined(
        workspaces.find((w) => w.workspace_id === workspace2.id && w.state === 'stopped'),
      );
      assert.isDefined(
        workspaces.find((w) => w.workspace_id === workspace3.id && w.state === 'stopped'),
      );

      const hostLogs1 = await getWorkspaceHostLogs(1);
      assert.lengthOf(hostLogs1, 0);

      const hostLogs2 = await getWorkspaceHostLogs(2);
      assert.lengthOf(hostLogs2, 1);
      assert.equal(hostLogs2[0].message, 'Host instance was not found');

      const hostLogs3 = await getWorkspaceHostLogs(3);
      assert.lengthOf(hostLogs3, 1);
      assert.equal(hostLogs3[0].message, 'Host instance was not found');

      const workspaceLogs1 = await getWorkspaceLogs(1);
      assert.lengthOf(workspaceLogs1, 0);

      const workspaceLogs2 = await getWorkspaceLogs(2);
      assert.lengthOf(workspaceLogs2, 1);
      assert.equal(workspaceLogs2[0].message, 'Host instance was not found');

      const workspaceLogs3 = await getWorkspaceLogs(3);
      assert.lengthOf(workspaceLogs3, 1);
      assert.equal(workspaceLogs3[0].message, 'Host instance was not found');
    });
  });
});
