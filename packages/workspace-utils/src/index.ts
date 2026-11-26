import { type Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Emitter as SocketIOEmitter } from '@socket.io/redis-emitter';
import type { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalScalar,
  queryRow,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema, IntervalSchema } from '@prairielearn/zod';

export {
  openWorkspaceGradedFiles,
  type OpenedWorkspaceGradedFiles,
  type WorkspaceGradedFile,
  workspaceFastGlobDefaultOptions,
  writeWorkspaceGradedFilesArchive,
} from './graded-files.js';

const WorkspaceVersionSchema = z.object({
  id: IdSchema,
  version: z.coerce.number(), // This is BIGINT, but always fits a number
});

const sql = loadSqlEquiv(import.meta.url);

export const WORKSPACE_SOCKET_NAMESPACE = '/workspace';

let socketIoServer: SocketIOServer | SocketIOEmitter | null = null;

export function init(io: SocketIOServer | SocketIOEmitter) {
  socketIoServer = io;
}

export function emitMessageForWorkspace(
  workspaceId: string | number,
  event: string,
  ...args: any[]
) {
  if (!socketIoServer) throw new Error('SocketIO server not initialized.');

  socketIoServer
    .of(WORKSPACE_SOCKET_NAMESPACE)
    .to(`workspace-${workspaceId}`)
    .emit(event, ...args);
}

/**
 * Updates a workspace's current message.
 *
 * @param workspace_id The workspace's id.
 * @param message The workspace's new message.
 * @param toDatabase Whether to write the message to the database.
 */
export async function updateWorkspaceMessage(
  workspace_id: string | number,
  message: string,
  toDatabase = true,
): Promise<void> {
  if (toDatabase) await execute(sql.update_workspace_message, { workspace_id, message });
  emitMessageForWorkspace(workspace_id, 'change:message', {
    workspace_id,
    message,
  });
}

/**
 * Whether the launch is still the workspace's current launch, as of this
 * statement rather than an earlier snapshot.
 */
export async function isWorkspaceLaunchCurrent(launch: WorkspaceLaunch): Promise<boolean> {
  return await queryScalar(
    sql.select_workspace_launch_is_current,
    { workspace_id: launch.id, launch_uuid: launch.launch_uuid },
    z.boolean(),
  );
}

/**
 * Updates the message of a launch that is still in progress. A superseded
 * launch writes and publishes nothing, so that its progress never appears on
 * the launch that replaced it.
 *
 * @param toDatabase Whether to write the message to the database.
 * @returns Whether the launch is still current.
 */
export async function updateWorkspaceLaunchMessage(
  launch: WorkspaceLaunch,
  message: string,
  toDatabase = true,
): Promise<boolean> {
  const current = toDatabase
    ? await queryScalar(
        sql.update_workspace_launch_message,
        { workspace_id: launch.id, launch_uuid: launch.launch_uuid, message },
        z.boolean(),
      )
    : await isWorkspaceLaunchCurrent(launch);
  if (current) {
    emitMessageForWorkspace(launch.id, 'change:message', { workspace_id: launch.id, message });
  }
  return current;
}

/**
 * Updates a workspace's current state and message.
 *
 * This applies no matter which launch the workspace is on, so it is only for
 * transitions that are meant to end whatever launch is current. Use
 * {@link startWorkspaceLaunch} to start a launch and
 * {@link updateWorkspaceLaunchState} to finish one.
 *
 * @param workspace_id The workspace's id.
 * @param state The workspace's new state.
 * @param message The workspace's new message.
 */
export async function updateWorkspaceState(
  workspace_id: string | number,
  state: 'uninitialized' | 'stopped',
  message = '',
): Promise<void> {
  await setWorkspaceState({ workspace_id, state, message });
}

/**
 * Identifies one attempt to launch a workspace. `launch_uuid` is only null for
 * a launch started by a main server that predates launch identities.
 */
export interface WorkspaceLaunch {
  id: string | number;
  launch_uuid: string | null;
}

/**
 * Moves a workspace to `launching` and returns the identity of the new launch.
 * Everything that later acts on behalf of this launch must present that
 * identity, so a launch that was superseded by a reboot or a reset can't
 * affect its replacement.
 */
export async function startWorkspaceLaunch(
  workspace_id: string | number,
  message: string,
): Promise<string> {
  const launch_uuid = crypto.randomUUID();
  await setWorkspaceState({ workspace_id, state: 'launching', message, launch_uuid });
  return launch_uuid;
}

/**
 * Finishes a launch, unless it is no longer the workspace's current launch.
 *
 * @returns Whether the workspace was updated.
 */
export async function updateWorkspaceLaunchState(
  launch: WorkspaceLaunch,
  result: { state: 'running'; hostname: string } | { state: 'stopped'; message: string },
): Promise<boolean> {
  return setWorkspaceState({
    workspace_id: launch.id,
    state: result.state,
    message: result.state === 'stopped' ? result.message : '',
    hostname: result.state === 'running' ? result.hostname : undefined,
    expectedLaunch: launch,
  });
}

async function setWorkspaceState({
  workspace_id,
  state,
  message,
  hostname,
  launch_uuid,
  expectedLaunch,
}: {
  workspace_id: string | number;
  state: 'uninitialized' | 'stopped' | 'launching' | 'running';
  message: string;
  hostname?: string;
  /** The identity of the launch that a transition to `launching` starts. */
  launch_uuid?: string;
  /** If set, the update only applies while this launch is in progress. */
  expectedLaunch?: WorkspaceLaunch;
}): Promise<boolean> {
  async function updateState() {
    const queryDuration = expectedLaunch ? queryOptionalScalar : queryScalar;
    const duration_milliseconds = await queryDuration(
      sql.update_workspace_state,
      {
        workspace_id,
        state,
        message,
        hostname: hostname ?? null,
        new_launch_uuid: launch_uuid ?? null,
        launch_guarded: expectedLaunch !== undefined,
        expected_launch_uuid: expectedLaunch?.launch_uuid ?? null,
      },
      IntervalSchema,
    );
    if (duration_milliseconds === null) return false;
    if (duration_milliseconds > 0) {
      await updateCourseInstanceUsagesForWorkspace({ workspace_id, duration_milliseconds });
    }
    return true;
  }

  // A guarded update commits before it is published, so a client never loads a
  // workspace whose `running` state it can't see yet. Other callers may already
  // be inside a transaction, in which case they publish before their commit.
  const updated = expectedLaunch ? await runInTransactionAsync(updateState) : await updateState();
  if (!updated) return false;
  emitMessageForWorkspace(workspace_id, 'change:state', {
    workspace_id,
    state,
    message,
  });
  return true;
}

/**
 * Updates the disk usage of a workspace. This is computed as the sum of the
 * sizes of all versions of the workspace. The result is stored in the
 * `disk_usage_bytes` column of the `workspaces` table. The total size is returned.
 *
 * @param workspace_id The ID of the workspace to update.
 * @param workspacesRoot The root directory of all workspace data.
 */
export async function updateWorkspaceDiskUsage(
  workspace_id: string,
  workspacesRoot: string,
): Promise<number> {
  const { version, id } = await queryRow(
    sql.select_workspace,
    { workspace_id },
    WorkspaceVersionSchema,
  );

  // We'll compute the size for all versions of the workspace so that we don't need
  // to separately store the size for each version.
  let totalSize = 0;
  for (let i = 1; i <= version; i++) {
    const workspaceVersionPath = path.join(workspacesRoot, `workspace-${id}-${i}`);
    const size = await getDirectoryDiskUsage(workspaceVersionPath);
    totalSize += size ?? 0;
  }

  await execute(sql.update_workspace_disk_usage_bytes, {
    workspace_id,
    disk_usage_bytes: totalSize,
  });

  return totalSize;
}

async function getDirectoryDiskUsage(dir: string): Promise<number | null> {
  let size = 0;

  for (const file of await getWorkspaceFiles(dir)) {
    try {
      const stats = await fs.lstat(path.join(file.parentPath, file.name));
      size += stats.size;
    } catch (err: any) {
      // This code is susceptible to TOCTOU issues, but we're ok with that.
      // We'll just silently ignore any files that can't be read. This would
      // most frequently occur when we're reading files from an active
      // workspace and a student deletes a file before we can read it.
      if (err.code !== 'ENOENT') throw err;
    }
  }

  return size;
}

async function getWorkspaceFiles(dir: string): Promise<Dirent[]> {
  try {
    // We use `withFileTypes: true` to avoid a bug where Node will try to recurse
    // into Unix domain socket files and fail with `ENOTDIR`.
    //
    // https://github.com/nodejs/node/issues/52159
    return await fs.readdir(dir, { recursive: true, withFileTypes: true });
  } catch (e: any) {
    // Workspace directories might not exist at all. For instance, this can
    // happen if a workspace is created for a variant but is never initialized
    // and started. We'll treat this as a workspace with no files.
    if (e.code === 'ENOENT') {
      return [];
    }
    throw e;
  }
}

/**
 * Update the course instance usages for workspace usage.
 * @param param
 * @param param.workspace_id The ID of the workspace.
 * @param param.duration_milliseconds The usage duration (in milliseconds).
 */
export async function updateCourseInstanceUsagesForWorkspace({
  workspace_id,
  duration_milliseconds,
}: {
  workspace_id: string | number;
  duration_milliseconds: number;
}) {
  await execute(sql.update_course_instance_usages_for_workspace, {
    workspace_id,
    duration_milliseconds,
  });
}
