import type { DirectoryBackupRecord } from '@cloudflare/sandbox';
import { DurableObject } from 'cloudflare:workers';

import type { RepositorySnapshotStatus } from '@prairielearn/course-agent-types';

import { logEvent, reportError } from '../monitoring.js';

interface RepositoryBranch {
  repository: string;
  branch: string;
}

// PrairieLearn's job stops waiting for a build after this long. A build still marked as running
// by then is treated as lost, so that a new request starts over instead of waiting forever.
const BUILD_ABANDONED_MS = 30 * 60 * 1000;

interface SnapshotRecord {
  source: RepositoryBranch;
  snapshot: { backup: DirectoryBackupRecord; commit: string; builtAt: string } | null;
  build:
    | { status: 'idle' }
    | { status: 'building'; startedAt: number }
    | { status: 'failed'; error: string };
}

/** GitHub treats owner and repository names case-insensitively; branch names are exact. */
export function repositorySnapshotName({ repository, branch }: RepositoryBranch) {
  return `${repository.toLowerCase()}@${branch}`;
}

/**
 * The cached copy of one repository branch. Only a build requested by PrairieLearn writes it, in
 * a container that never runs an agent, so it holds nothing but what GitHub served. Conversation
 * sandboxes restore it read-only and then fetch the branch tip themselves.
 */
export class RepositorySnapshot extends DurableObject<Env> {
  private get record() {
    return this.ctx.storage.kv.get<SnapshotRecord>('snapshot');
  }

  private set record(record: SnapshotRecord | undefined) {
    this.ctx.storage.kv.put('snapshot', record);
  }

  /** The archive for a new sandbox to restore, if this branch has been cached. */
  current() {
    return this.record?.snapshot?.backup ?? null;
  }

  status(): RepositorySnapshotStatus {
    const record = this.record;
    const build = record?.build ?? { status: 'idle' };
    return {
      build: build.status === 'building' ? { status: 'building' } : build,
      snapshot: record?.snapshot
        ? {
            commit: record.snapshot.commit,
            bytes: record.snapshot.backup.size,
            builtAt: record.snapshot.builtAt,
          }
        : null,
    };
  }

  /** Start replacing the snapshot with a fresh clone, unless a build is already under way. */
  async requestBuild(source: RepositoryBranch) {
    const record = this.record;
    if (
      record?.build.status !== 'building' ||
      Date.now() - record.build.startedAt > BUILD_ABANDONED_MS
    ) {
      this.record = {
        source,
        snapshot: record?.snapshot ?? null,
        build: { status: 'building', startedAt: Date.now() },
      };
      // The build outlives this request, so it runs from an alarm.
      await this.ctx.storage.setAlarm(Date.now());
    }
    return this.status();
  }

  override async alarm() {
    const record = this.record;
    if (record?.build.status !== 'building') return;
    const started = Date.now();
    const name = repositorySnapshotName(record.source);
    try {
      const built = await this.env.CourseSandbox.getByName(
        `repository-snapshot:${name}`,
      ).buildRepositorySnapshot(record.source);
      this.record = {
        source: record.source,
        snapshot: { ...built, builtAt: new Date().toISOString() },
        build: { status: 'idle' },
      };
      logEvent('repository_snapshot_built', {
        ...record.source,
        commit: built.commit,
        bytes: built.backup.size,
        elapsedMs: Date.now() - started,
      });
    } catch (error) {
      // Recorded rather than rethrown: a rethrown alarm retries, and a build that cannot succeed
      // (a missing branch, a revoked token) would clone again on every retry.
      reportError(error);
      this.record = {
        ...record,
        build: { status: 'failed', error: error instanceof Error ? error.message : String(error) },
      };
      return;
    }
    // A sandbox restoring the previous archive right now fails that restore and clones instead.
    if (record.snapshot) {
      await this.env.CourseSandbox.getByName('archive-cleanup').deleteRepositorySnapshot(
        record.snapshot.backup,
      );
    }
  }
}
