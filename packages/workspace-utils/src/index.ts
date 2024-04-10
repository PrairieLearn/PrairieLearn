import { loadSqlEquiv, queryAsync, queryOneRowAsync } from '@prairielearn/postgres';
import { contains } from '@prairielearn/path-utils';
import type { Server as SocketIOServer } from 'socket.io';
import type { Emitter as SocketIOEmitter } from '@socket.io/redis-emitter';
import fg, { Entry } from 'fast-glob';
import { filesize } from 'filesize';
import { type Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const sql = loadSqlEquiv(__filename);

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
 * @param id The workspace's id.
 * @param message The workspace's new message.
 * @param toDatabase Whether to write the message to the database.
 */
export async function updateWorkspaceMessage(
  workspace_id: string | number,
  message: string,
  toDatabase = true,
): Promise<void> {
  if (toDatabase) await queryAsync(sql.update_workspace_message, { workspace_id, message });
  emitMessageForWorkspace(workspace_id, 'change:message', {
    workspace_id,
    message,
  });
}

/**
 * Updates a workspace's current state and message.
 *
 * @param id The workspace's id.
 * @param state The workspace's new state.
 * @param message The workspace's new message.
 */
export async function updateWorkspaceState(
  workspace_id: string | number,
  state: string,
  message = '',
): Promise<void> {
  // TODO: add locking
  await queryAsync(sql.update_workspace_state, { workspace_id, state, message });
  emitMessageForWorkspace(workspace_id, 'change:state', {
    workspace_id,
    state,
    message,
  });
}

interface GradedFilesLimits {
  maxFiles: number;
  maxSize: number;
}

export async function getWorkspaceGradedFiles(
  workspaceDir: string,
  gradedFiles: string[],
  limits: GradedFilesLimits,
): Promise<Entry[]> {
  const files = (
    await fg(gradedFiles, {
      cwd: workspaceDir,
      stats: true,
      ...workspaceFastGlobDefaultOptions,
    })
  ).filter((file) => contains(workspaceDir, path.join(workspaceDir, file.path)));

  // We generally use `archiver` downstream of this, which does not elegantly
  // handle file names with backslashes:
  // https://github.com/archiverjs/node-archiver/issues/743
  // To prevent downstream issues, we disallow any files with backslashes in
  // their paths. We fail hard rather than silently dropping these files so
  // that it's clear to the user what's happening.
  const backslashPaths = files.filter((file) => file.path.includes('\\'));
  if (backslashPaths.length > 0) {
    const paths = backslashPaths.map((file) => file.path).join(', ');
    throw new Error(`Cannot submit files with paths that contain backslashes: ${paths}`);
  }

  if (files.length > limits.maxFiles) {
    throw new Error(`Cannot submit more than ${limits.maxFiles} files from the workspace.`);
  }

  const totalSize = files.reduce((acc, file) => acc + (file.stats?.size ?? 0), 0);
  if (totalSize > limits.maxSize) {
    throw new Error(
      `Workspace files exceed limit of ${filesize(limits.maxSize, {
        base: 2,
      })}.`,
    );
  }

  return files;
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
  const result = await queryOneRowAsync(sql.select_workspace, { workspace_id });
  const workspace = result.rows[0];

  // We'll compute the size for all versions of the workspace so that we don't need
  // to separately store the size for each version.
  const version = Number.parseInt(workspace.version, 10);

  let totalSize = 0;
  for (let i = 1; i <= version; i++) {
    const workspaceVersionPath = path.join(
      workspacesRoot,
      `workspace-${workspace.id}-${workspace.version}`,
    );
    const size = await getDirectoryDiskUsage(workspaceVersionPath);
    totalSize += size ?? 0;
  }

  await queryAsync(sql.update_workspace_disk_usage_bytes, {
    workspace_id,
    disk_usage_bytes: totalSize,
  });

  return totalSize;
}

async function getDirectoryDiskUsage(dir: string): Promise<number | null> {
  let size = 0;

  for (const file of await getWorkspaceFiles(dir)) {
    try {
      const stats = await fs.lstat(path.join(file.path, file.name));
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
 * Default options for calls to `fast-glob`.
 */
export const workspaceFastGlobDefaultOptions = {
  extglob: false,
  braceExpansion: false,
};
