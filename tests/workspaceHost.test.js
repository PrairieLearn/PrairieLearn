// @ts-check
const { assert } = require('chai');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const sqldb = require('@prairielearn/postgres');

const workspaceHostUtils = require('../lib/workspaceHost');
const helperDb = require('./helperDb');

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
  workspace_host_id: z.string().nullable(),
});

async function insertWorkspaceHost(id, state = 'launching') {
  return sqldb.queryValidatedOneRow(
    'INSERT INTO workspace_hosts (id, instance_id, state) VALUES ($id, $instance_id, $state) RETURNING *;',
    {
      id,
      instance_id: uuidv4(),
      state,
    },
    WorkspaceHostSchema
  );
}

async function insertWorkspace(id) {
  await sqldb.queryAsync('INSERT INTO workspaces (id, state) VALUES ($id, $state);', {
    id,
    state: 'launching',
  });
}

async function selectWorkspace(id) {
  return sqldb.queryValidatedOneRow(
    'SELECT * FROM workspaces WHERE id = $id;',
    { id },
    WorkspaceSchema
  );
}

async function getWorkspaceHostLogs() {
  return sqldb.queryValidatedRows('SELECT * FROM workspace_host_logs', {}, WorkspaceHostLogsSchema);
}

describe('workspaceHost utilities', function () {
  before(async () => {
    await helperDb.before.call(this);
  });

  beforeEach(async () => {
    await sqldb.queryAsync('DELETE FROM workspaces;', {});
    await sqldb.queryAsync('DELETE FROM workspace_hosts;', {});
    await sqldb.queryAsync('DELETE FROM workspace_host_logs;', {});
  });

  describe('markHostUnhealthy()', () => {
    it('should mark a host as unhealthy', async () => {
      await insertWorkspaceHost(1);

      await workspaceHostUtils.markWorkspaceHostUnhealthy('1', 'test');

      const logs = await getWorkspaceHostLogs();
      assert.lengthOf(logs, 1);

      const log = logs[0];
      assert.equal(log.workspace_host_id, '1');
      assert.equal(log.message, 'test');
      assert.equal(log.state, 'unhealthy');
    });
  });

  describe('assignWorkspaceToHost', () => {
    it('show assign a workspace to a host', async () => {
      await insertWorkspace(1);
      await insertWorkspaceHost(1, 'ready');

      const hostId = await workspaceHostUtils.assignWorkspaceToHost('1', 1);
      assert.equal(hostId, '1');

      const workspace = await selectWorkspace('1');
      assert.equal(workspace.workspace_host_id, '1');
    });

    it('should not assign a workspace to a host if it is unhealthy', async () => {
      await insertWorkspace(1);
      await insertWorkspaceHost(1, 'unhealthy');

      const hostId = await workspaceHostUtils.assignWorkspaceToHost('1', 1);
      assert.isNull(hostId);

      const workspace = await selectWorkspace('1');
      assert.isNull(workspace.workspace_host_id);
    });

    it('should not assign a workspace to a host if it is at capacity', async () => {
      await insertWorkspace(1);
      await insertWorkspaceHost(1, 'ready');

      // Set capacity to zero to simulate a full host.
      const hostId = await workspaceHostUtils.assignWorkspaceToHost('1', 0);
      assert.isNull(hostId);

      const workspace = await selectWorkspace('1');
      assert.isNull(workspace.workspace_host_id);
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
});
