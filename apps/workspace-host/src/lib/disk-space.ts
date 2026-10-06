import fs from 'node:fs/promises';

import type Docker from 'dockerode';

import { config } from './config.js';

export class DiskSpaceMonitor {
  private dockerDataDir: string | null = null;
  private unhealthyReason: Error | null = null;

  constructor(
    private readonly docker: Docker,
    private readonly markUnhealthy: (reason: Error) => Promise<void>,
  ) {}

  async init(): Promise<boolean> {
    const healthy = await this.check();
    this.scheduleNextCheck();
    return healthy;
  }

  private scheduleNextCheck() {
    setTimeout(async () => {
      await this.check();
      this.scheduleNextCheck();
    }, config.workspaceHostDiskSpaceCheckIntervalSec * 1000);
  }

  async check(): Promise<boolean> {
    if (this.unhealthyReason === null) {
      try {
        if (
          config.workspaceHostMinAvailableDiskBytes === 0 ||
          (!config.runningInEc2 && config.workspaceHostDockerDataDir === null)
        ) {
          return true;
        }

        const dockerDataDir: string =
          this.dockerDataDir ??
          config.workspaceHostDockerDataDir ??
          (await this.docker.info()).DockerRootDir;
        this.dockerDataDir = dockerDataDir;
        const { bavail, bsize } = await fs.statfs(dockerDataDir, { bigint: true });
        // Available blocks exclude filesystem reservations, unlike free blocks.
        const availableBytes = bavail * bsize;
        if (availableBytes < BigInt(config.workspaceHostMinAvailableDiskBytes)) {
          throw new Error(
            `Insufficient disk space on Docker data filesystem (${this.dockerDataDir}): ${availableBytes} bytes available, minimum ${config.workspaceHostMinAvailableDiskBytes} bytes`,
          );
        }
      } catch (err) {
        this.unhealthyReason ??= new Error(`Workspace host disk space check failed: ${err}`, {
          cause: err,
        });
      }
    }

    // Health is latched even if space is freed or another concurrent check succeeds.
    // Retry the database transition in case it failed when we first detected the problem.
    if (this.unhealthyReason !== null) {
      await this.markUnhealthy(this.unhealthyReason);
      return false;
    }
    return true;
  }
}
