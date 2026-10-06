import type { BigIntStatsFs } from 'node:fs';
import fs from 'node:fs/promises';

import Docker from 'dockerode';
import { afterEach, assert, beforeEach, describe, it, vi } from 'vitest';

import { ConfigSchema, config } from './config.js';
import { DiskSpaceMonitor } from './disk-space.js';

function filesystemStats(bavail: bigint, bsize = 1n): BigIntStatsFs {
  return {
    type: 0n,
    bsize,
    frsize: bsize,
    blocks: 100_000_000_000n,
    bfree: 20_000_000_000n,
    bavail,
    files: 1_000_000n,
    ffree: 1_000_000n,
  };
}

describe('DiskSpaceMonitor', () => {
  const originalConfig = { ...config };
  let docker: Docker;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(config, {
      runningInEc2: true,
      workspaceHostDockerDataDir: null,
      workspaceHostMinAvailableDiskBytes: 10_000_000_000,
      workspaceHostDiskSpaceCheckIntervalSec: 60,
    });
    docker = new Docker();
    vi.spyOn(docker, 'info').mockResolvedValue({ DockerRootDir: '/docker-data' });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.assign(config, originalConfig);
  });

  it('defaults to 10 decimal GB and rejects invalid thresholds and intervals', () => {
    assert.equal(ConfigSchema.parse({}).workspaceHostMinAvailableDiskBytes, 10_000_000_000);
    assert.isFalse(ConfigSchema.safeParse({ workspaceHostMinAvailableDiskBytes: -1 }).success);
    assert.isFalse(ConfigSchema.safeParse({ workspaceHostMinAvailableDiskBytes: 0.5 }).success);
    assert.isFalse(ConfigSchema.safeParse({ workspaceHostDiskSpaceCheckIntervalSec: 0 }).success);
  });

  it.each([
    [9_999_999_999n, false],
    [10_000_000_000n, true],
    [10_500_000_000n, true],
  ])('checks the exact threshold with %s available bytes', async (availableBytes, healthy) => {
    const statfs = vi.spyOn(fs, 'statfs').mockResolvedValue(filesystemStats(availableBytes));
    const markUnhealthy = vi.fn<(reason: Error) => Promise<void>>().mockResolvedValue();
    const monitor = new DiskSpaceMonitor(docker, markUnhealthy);

    assert.equal(await monitor.init(), healthy);
    assert.deepEqual(statfs.mock.calls, [['/docker-data', { bigint: true }]]);
    assert.equal(markUnhealthy.mock.calls.length, healthy ? 0 : 1);
    if (!healthy) {
      assert.include(markUnhealthy.mock.calls[0][0].message, `${availableBytes} bytes available`);
      assert.include(markUnhealthy.mock.calls[0][0].message, '10000000000 bytes');
    }
  });

  it('uses available blocks rather than free blocks and scales by block size', async () => {
    vi.spyOn(fs, 'statfs').mockResolvedValue(filesystemStats(2_000_000n, 4096n));
    const markUnhealthy = vi.fn<(reason: Error) => Promise<void>>().mockResolvedValue();

    assert.isFalse(await new DiskSpaceMonitor(docker, markUnhealthy).check());
    assert.include(markUnhealthy.mock.calls[0][0].message, '8192000000 bytes available');
  });

  it('monitors periodically and keeps the host unhealthy after space is freed', async () => {
    const statfs = vi.spyOn(fs, 'statfs').mockResolvedValue(filesystemStats(20_000_000_000n));
    const markUnhealthy = vi.fn<(reason: Error) => Promise<void>>().mockResolvedValue();
    const monitor = new DiskSpaceMonitor(docker, markUnhealthy);

    assert.isTrue(await monitor.init());
    statfs.mockResolvedValue(filesystemStats(1_000_000_000n));
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(markUnhealthy.mock.calls.length, 1);

    statfs.mockResolvedValue(filesystemStats(20_000_000_000n));
    assert.isFalse(await monitor.check());
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(markUnhealthy.mock.calls.length, 3);
    assert.equal(statfs.mock.calls.length, 2);
    assert.equal(vi.mocked(docker.info).mock.calls.length, 1);
  });

  it('does not wait for the next periodic check to detect space consumed by a launch', async () => {
    const statfs = vi.spyOn(fs, 'statfs').mockResolvedValue(filesystemStats(20_000_000_000n));
    const markUnhealthy = vi.fn<(reason: Error) => Promise<void>>().mockResolvedValue();
    const monitor = new DiskSpaceMonitor(docker, markUnhealthy);

    assert.isTrue(await monitor.init());
    statfs.mockResolvedValue(filesystemStats(1_000_000_000n));
    assert.isFalse(await monitor.check());
    assert.equal(markUnhealthy.mock.calls.length, 1);
  });

  it('cannot become healthy when a concurrent check succeeds after a failure', async () => {
    config.workspaceHostDockerDataDir = '/docker-data';
    let resolveStats!: (stats: BigIntStatsFs) => void;
    const pendingStats = new Promise<BigIntStatsFs>((resolve) => {
      resolveStats = resolve;
    });
    vi.spyOn(fs, 'statfs')
      .mockImplementationOnce(() => pendingStats)
      .mockResolvedValue(filesystemStats(1_000_000_000n));
    const markUnhealthy = vi.fn<(reason: Error) => Promise<void>>().mockResolvedValue();
    const monitor = new DiskSpaceMonitor(docker, markUnhealthy);

    const pendingCheck = monitor.check();
    assert.isFalse(await monitor.check());
    resolveStats(filesystemStats(20_000_000_000n));
    assert.isFalse(await pendingCheck);
    assert.equal(markUnhealthy.mock.calls.length, 2);
  });

  it.each(['statfs', 'docker'])('fails closed if %s cannot be queried', async (failure) => {
    const statfs = vi.spyOn(fs, 'statfs').mockResolvedValue(filesystemStats(20_000_000_000n));
    if (failure === 'statfs') {
      statfs.mockRejectedValue(new Error('filesystem unavailable'));
    } else {
      vi.mocked(docker.info).mockRejectedValue(new Error('Docker unavailable'));
    }
    const markUnhealthy = vi.fn<(reason: Error) => Promise<void>>().mockResolvedValue();
    const monitor = new DiskSpaceMonitor(docker, markUnhealthy);

    assert.isFalse(await monitor.init());
    assert.include(markUnhealthy.mock.calls[0][0].message, 'unavailable');
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(markUnhealthy.mock.calls.length, 2);
  });

  it('skips development Docker directories unless an explicit path is configured', async () => {
    config.runningInEc2 = false;
    const statfs = vi.spyOn(fs, 'statfs').mockResolvedValue(filesystemStats(20_000_000_000n));
    const markUnhealthy = vi.fn<(reason: Error) => Promise<void>>().mockResolvedValue();
    const monitor = new DiskSpaceMonitor(docker, markUnhealthy);

    assert.isTrue(await monitor.check());
    assert.equal(statfs.mock.calls.length, 0);
    config.workspaceHostDockerDataDir = '/mounted-docker-data';
    assert.isTrue(await monitor.check());
    assert.deepEqual(statfs.mock.calls, [['/mounted-docker-data', { bigint: true }]]);
    assert.equal(vi.mocked(docker.info).mock.calls.length, 0);
  });

  it('allows disk checks to be disabled with a zero threshold', async () => {
    config.workspaceHostMinAvailableDiskBytes = 0;
    const statfs = vi.spyOn(fs, 'statfs');
    const markUnhealthy = vi.fn<(reason: Error) => Promise<void>>().mockResolvedValue();

    assert.isTrue(await new DiskSpaceMonitor(docker, markUnhealthy).check());
    assert.equal(statfs.mock.calls.length, 0);
    assert.equal(vi.mocked(docker.info).mock.calls.length, 0);
  });
});
