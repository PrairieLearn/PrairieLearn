import fs from 'node:fs/promises';

import * as async from 'async';
import Docker from 'dockerode';
import express, { type Request, type RequestHandler, type Response } from 'express';
import { afterEach, assert, beforeEach, describe, it, vi } from 'vitest';

import { loadSqlEquiv } from '@prairielearn/postgres';
import type * as postgres from '@prairielearn/postgres';
import type * as workspace from '@prairielearn/workspace-utils';

import type { config as hostConfig } from './lib/config.js';

const sql = loadSqlEquiv(new URL('interface.ts', import.meta.url).href);

describe('workspace host disk protection', () => {
  let config: typeof hostConfig;
  let originalConfig: typeof hostConfig;
  let startupSteps: (() => Promise<void>)[];
  let statusHandler: RequestHandler;
  let actionHandler: RequestHandler;
  let sqldb: typeof postgres;
  let workspaceUtils: typeof workspace;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const configModule = await import('./lib/config.js');
    sqldb = await import('@prairielearn/postgres');
    workspaceUtils = await import('@prairielearn/workspace-utils');
    const { logger } = await import('@prairielearn/logger');
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    config = configModule.config;
    originalConfig = { ...config };
    Object.assign(config, {
      runningInEc2: false,
      workspaceHostDockerDataDir: '/docker-data',
      workspaceHostMinAvailableDiskBytes: 10_000_000_000,
      workspaceHostDiskSpaceCheckIntervalSec: 60,
      workspaceHostMinPortRange: 45001,
      workspaceHostMaxPortRange: 45002,
      workspacePullImagesFromDockerHub: false,
    });
    vi.spyOn(configModule, 'loadConfig').mockResolvedValue();
    vi.spyOn(async, 'series').mockResolvedValue({});
    const get = vi.spyOn(express.application, 'get');
    const post = vi.spyOn(express.application, 'post');
    vi.spyOn(sqldb, 'execute').mockResolvedValue(0);
    vi.spyOn(sqldb, 'runInTransactionAsync').mockImplementation(async (fn) => {
      return await fn({} as Parameters<typeof fn>[0]);
    });
    vi.spyOn(sqldb, 'queryOptionalRow').mockResolvedValue({
      id: '1',
      state: 'launching',
      version: 1,
      launch_uuid: null,
      launch_port: null,
    });
    vi.spyOn(workspaceUtils, 'updateWorkspaceState').mockResolvedValue();
    vi.spyOn(workspaceUtils, 'updateWorkspaceMessage').mockResolvedValue();
    vi.spyOn(Docker.prototype, 'listContainers').mockResolvedValue([]);
    vi.spyOn(Docker.prototype, 'createContainer');
    vi.spyOn(Docker.prototype, 'pull');
    vi.spyOn(fs, 'access').mockResolvedValue();
    vi.spyOn(fs, 'chown').mockResolvedValue();
    vi.spyOn(fs, 'statfs').mockResolvedValue({
      type: 0n,
      bsize: 1n,
      frsize: 1n,
      blocks: 100_000_000_000n,
      bfree: 20_000_000_000n,
      bavail: 20_000_000_000n,
      files: 1_000_000n,
      ffree: 1_000_000n,
    });

    await import('./interface.js');
    startupSteps = vi.mocked(async.series).mock.calls[0][0] as unknown as (() => Promise<void>)[];
    statusHandler = get.mock.calls.find(([route]) => route === '/status')![1] as RequestHandler;
    actionHandler = post.mock.calls.find(([route]) => route === '/')![1] as RequestHandler;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.assign(config, originalConfig);
    vi.resetModules();
  });

  function response() {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  async function registerHost() {
    // Initialize identity and port, then registration/health, without external services.
    await startupSteps[0]();
    await startupSteps[2]();
    await startupSteps[8]();
  }

  function setLowSpace() {
    vi.mocked(fs.statfs).mockResolvedValue({
      type: 0n,
      bsize: 1n,
      frsize: 1n,
      blocks: 100_000_000_000n,
      bfree: 20_000_000_000n,
      bavail: 1_000_000_000n,
      files: 1_000_000n,
      ffree: 1_000_000n,
    });
  }

  it('never advertises readiness when startup disk space is low', async () => {
    setLowSpace();
    await registerHost();
    const queries = vi.mocked(sqldb.execute).mock.calls.map(([query]) => query);
    assert.include(queries, sql.insert_workspace_hosts);
    assert.include(queries, sql.mark_host_unhealthy);
    assert.notInclude(queries, sql.mark_host_ready);
    assert.equal(vi.mocked(Docker.prototype.listContainers).mock.calls.length, 0);
    assert.equal(vi.mocked(workspaceUtils.updateWorkspaceState).mock.calls.length, 0);
  });

  it('reports periodic disk failures through status and rejects already-assigned launches', async () => {
    await registerHost();
    assert.include(
      vi.mocked(sqldb.execute).mock.calls.map(([query]) => query),
      sql.mark_host_ready,
    );
    setLowSpace();
    await vi.advanceTimersByTimeAsync(60_000);

    const status = response();
    const next = vi.fn();
    await statusHandler({} as Request, status, next);
    assert.deepEqual(vi.mocked(status.status).mock.calls, [[500]]);
    assert.deepEqual(vi.mocked(status.json).mock.calls, [
      [{ docker: [], postgres: 'ok', disk_space: null }],
    ]);

    await actionHandler(
      { body: { workspace_id: '1', action: 'init' } } as Request,
      response(),
      next,
    );
    assert.deepEqual(vi.mocked(workspaceUtils.updateWorkspaceState).mock.calls, [
      ['1', 'stopped', 'Workspace host is unavailable. Click "Reboot" to try again.'],
    ]);
    assert.equal(vi.mocked(Docker.prototype.pull).mock.calls.length, 0);
    assert.equal(vi.mocked(Docker.prototype.createContainer).mock.calls.length, 0);
    assert.equal(next.mock.calls.length, 0);
  });

  it('does not stop a workspace that is already running or has moved to another launch', async () => {
    setLowSpace();
    await registerHost();
    vi.mocked(sqldb.queryOptionalRow).mockResolvedValue(null);
    const next = vi.fn();
    await actionHandler(
      { body: { workspace_id: '1', action: 'init' } } as Request,
      response(),
      next,
    );
    assert.equal(vi.mocked(workspaceUtils.updateWorkspaceState).mock.calls.length, 0);
    assert.equal(vi.mocked(Docker.prototype.createContainer).mock.calls.length, 0);
    assert.equal(next.mock.calls.length, 0);
  });

  it('keeps rejecting launches when the unhealthy database transition fails', async () => {
    setLowSpace();
    vi.mocked(sqldb.execute).mockImplementation(async (query) => {
      if (query === sql.mark_host_unhealthy) throw new Error('Database unavailable');
      return 0;
    });
    await registerHost();
    const status = response();
    const next = vi.fn();
    await statusHandler({} as Request, status, next);
    assert.deepEqual(vi.mocked(status.status).mock.calls, [[500]]);
    await actionHandler(
      { body: { workspace_id: '1', action: 'init' } } as Request,
      response(),
      next,
    );
    assert.equal(vi.mocked(Docker.prototype.createContainer).mock.calls.length, 0);
    assert.equal(vi.mocked(workspaceUtils.updateWorkspaceState).mock.calls.length, 1);
    assert.notInclude(
      vi.mocked(sqldb.execute).mock.calls.map(([query]) => query),
      sql.mark_host_ready,
    );
    assert.equal(next.mock.calls.length, 0);
  });

  it('rechecks space immediately before container creation', async () => {
    await registerHost();
    vi.spyOn(sqldb, 'queryScalar').mockResolvedValue(false);
    vi.spyOn(sqldb, 'queryRow').mockImplementation(async (query) => {
      if (query === sql.select_workspace) {
        return { version: 1, course_id: '1', institution_id: '1' };
      }
      return {
        workspace_image: 'prairielearn/workspace-test',
        workspace_home: '/home/workspace',
        workspace_port: 8080,
        workspace_url_rewrite: true,
        workspace_args: '',
        workspace_environment: {},
        workspace_enable_networking: true,
      };
    });
    vi.mocked(fs.chown).mockImplementation(async () => setLowSpace());
    const next = vi.fn();
    await actionHandler(
      { body: { workspace_id: '1', action: 'init' } } as Request,
      response(),
      next,
    );

    assert.equal(vi.mocked(Docker.prototype.createContainer).mock.calls.length, 0);
    assert.deepEqual(vi.mocked(workspaceUtils.updateWorkspaceState).mock.calls, [
      ['1', 'stopped', 'Workspace host is unavailable. Click "Reboot" to try again.'],
    ]);
    const pendingLaunchParams = vi.mocked(sqldb.queryOptionalRow).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    assert.propertyVal(pendingLaunchParams, 'version', 1);
    assert.isString(pendingLaunchParams.launch_uuid);
    assert.equal(next.mock.calls.length, 0);
  });
});
