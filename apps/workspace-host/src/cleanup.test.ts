import type { Upload as StorageUpload } from '@aws-sdk/lib-storage';
import * as async from 'async';
import Docker from 'dockerode';
import { afterEach, assert, beforeEach, describe, it, vi } from 'vitest';

import type { logger as globalLogger } from '@prairielearn/logger';
import { loadSqlEquiv } from '@prairielearn/postgres';
import type * as postgres from '@prairielearn/postgres';
import type * as workspace from '@prairielearn/workspace-utils';

import type { config as hostConfig } from './lib/config.js';

const sql = loadSqlEquiv(new URL('interface.ts', import.meta.url).href);
const stoppedWorkspace = {
  id: '1',
  state: 'stopped',
  version: 1,
  launch_uuid: 'launch-uuid',
  launch_port: 8080,
};

describe('workspace host cleanup', () => {
  let config: typeof hostConfig;
  let originalConfig: typeof hostConfig;
  let sqldb: typeof postgres;
  let workspaceUtils: typeof workspace;
  let logger: typeof globalLogger;
  let Upload: typeof StorageUpload;
  let container: Docker.Container;
  let startupSteps: (() => Promise<void>)[];

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const configModule = await import('./lib/config.js');
    config = configModule.config;
    originalConfig = { ...config };
    Object.assign(config, {
      runningInEc2: true,
      workspaceHostPruneContainersSec: 60,
      workspaceLogsS3Bucket: 'workspace-test-logs',
    });
    vi.spyOn(configModule, 'loadConfig').mockResolvedValue();
    sqldb = await import('@prairielearn/postgres');
    workspaceUtils = await import('@prairielearn/workspace-utils');
    ({ logger } = await import('@prairielearn/logger'));
    ({ Upload } = await import('@aws-sdk/lib-storage'));
    const Sentry = await import('@prairielearn/sentry');
    vi.spyOn(Sentry, 'captureException').mockReturnValue('event-id');
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(async, 'series').mockResolvedValue({});
    vi.spyOn(sqldb, 'execute').mockResolvedValue(0);
    vi.spyOn(sqldb, 'queryRows').mockResolvedValue([]);
    vi.spyOn(sqldb, 'runInTransactionAsync').mockImplementation(async (fn) => {
      return await fn({} as Parameters<typeof fn>[0]);
    });
    vi.spyOn(workspaceUtils, 'updateWorkspaceState').mockResolvedValue();
    vi.spyOn(workspaceUtils, 'updateWorkspaceDiskUsage').mockResolvedValue(0);
    vi.spyOn(Upload.prototype, 'done').mockResolvedValue({ $metadata: {} });
    const docker = new Docker();
    container = docker.getContainer('container-id');
    const bufferedContainer: {
      inspect(): Promise<{
        Config: Pick<Docker.ContainerInspectInfo['Config'], 'Labels'>;
        State: Pick<Docker.ContainerInspectInfo['State'], 'StartedAt'>;
      }>;
      logs(options?: Docker.ContainerLogsOptions & { follow?: false }): Promise<Buffer>;
    } = container;
    vi.spyOn(bufferedContainer, 'inspect').mockResolvedValue({
      Config: {
        Labels: {
          'prairielearn.workspace-id': '1',
          'prairielearn.workspace-version': '1',
          'prairielearn.course-id': '1',
          'prairielearn.institution-id': '1',
        },
      },
      State: { StartedAt: '2026-10-06T12:00:00Z' },
    });
    vi.spyOn(container, 'kill').mockResolvedValue(undefined);
    vi.spyOn(bufferedContainer, 'logs').mockResolvedValue(Buffer.alloc(0));
    vi.spyOn(container, 'remove').mockResolvedValue(undefined);
    vi.spyOn(Docker.prototype, 'getContainer').mockReturnValue(container);
    vi.spyOn(Docker.prototype, 'listContainers').mockImplementation(async (options) => {
      return options?.all ? [] : [{ Id: 'container-id' } as Docker.ContainerInfo];
    });
    vi.spyOn(Docker.prototype, 'pruneVolumes').mockResolvedValue({
      VolumesDeleted: [],
      SpaceReclaimed: 0,
    });
    vi.spyOn(Docker.prototype, 'pruneImages');

    await import('./interface.js');
    startupSteps = vi.mocked(async.series).mock.calls[0][0] as unknown as (() => Promise<void>)[];
    await startupSteps[0]();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.assign(config, originalConfig);
    vi.resetModules();
  });

  function stopWorkspace() {
    vi.mocked(sqldb.queryRows).mockImplementation(async (query) => {
      return query === sql.get_stopped_workspaces ? [stoppedWorkspace] : [];
    });
  }

  it('waits for the log upload before removing the container and its anonymous volumes', async () => {
    stopWorkspace();
    let completeUpload!: () => void;
    vi.mocked(Upload.prototype.done).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeUpload = () => resolve({ $metadata: {} });
        }),
    );
    await startupSteps[7]();
    const maintenance = vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => assert.equal(vi.mocked(Upload.prototype.done).mock.calls.length, 1));
    assert.equal(vi.mocked(container.remove).mock.calls.length, 0);
    completeUpload();
    await maintenance;
    await vi.waitFor(() =>
      assert.deepEqual(vi.mocked(container.remove).mock.calls, [[{ v: true }]]),
    );
    assert.deepEqual(vi.mocked(workspaceUtils.updateWorkspaceDiskUsage).mock.calls, [
      ['1', config.workspaceHostHomeDirRoot],
    ]);
  });

  it('sweeps unused anonymous volumes after container cleanup and load-count maintenance in EC2', async () => {
    stopWorkspace();
    await startupSteps[7]();
    await vi.advanceTimersByTimeAsync(60_000);

    assert.deepEqual(vi.mocked(container.remove).mock.calls, [[{ v: true }]]);
    assert.deepEqual(vi.mocked(Docker.prototype.pruneVolumes).mock.calls, [[]]);
    const execute = vi.mocked(sqldb.execute);
    const loadUpdate = execute.mock.calls.findIndex(([query]) => query === sql.update_load_count);
    assert.isBelow(
      vi.mocked(container.remove).mock.invocationCallOrder[0],
      execute.mock.invocationCallOrder[loadUpdate],
    );
    assert.isBelow(
      execute.mock.invocationCallOrder[loadUpdate],
      vi.mocked(Docker.prototype.pruneVolumes).mock.invocationCallOrder[0],
    );
    assert.equal(vi.mocked(Docker.prototype.pruneImages).mock.calls.length, 0);
  });

  it('removes a workspace container with its volumes in development without a global sweep', async () => {
    config.runningInEc2 = false;
    stopWorkspace();
    await startupSteps[7]();
    await vi.advanceTimersByTimeAsync(60_000);

    assert.deepEqual(vi.mocked(container.remove).mock.calls, [[{ v: true }]]);
    assert.equal(vi.mocked(Docker.prototype.pruneVolumes).mock.calls.length, 0);
    assert.equal(vi.mocked(Docker.prototype.pruneImages).mock.calls.length, 0);
  });

  it('continues maintenance after a failed volume sweep', async () => {
    vi.mocked(Docker.prototype.pruneVolumes).mockRejectedValueOnce(new Error('Prune failed'));
    await startupSteps[7]();
    await vi.advanceTimersByTimeAsync(120_000);

    assert.equal(vi.mocked(Docker.prototype.pruneVolumes).mock.calls.length, 2);
    assert.equal(vi.mocked(logger.error).mock.calls.length, 1);
    assert.equal(
      vi.mocked(sqldb.execute).mock.calls.filter(([query]) => query === sql.update_load_count)
        .length,
      2,
    );
  });

  it('removes anonymous volumes when cleaning up a launch interrupted by a host crash', async () => {
    vi.mocked(sqldb.queryRows).mockResolvedValue([{ ...stoppedWorkspace, state: 'launching' }]);
    await startupSteps[9]();

    assert.deepEqual(vi.mocked(container.remove).mock.calls, [[{ v: true }]]);
    assert.equal(vi.mocked(Upload.prototype.done).mock.calls.length, 1);
    assert.equal(vi.mocked(Docker.prototype.pruneImages).mock.calls.length, 0);
  });
});
