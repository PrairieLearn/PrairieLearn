import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';
import { contains } from '@prairielearn/path-utils';
import type { Server as SocketIOServer } from 'socket.io';
import type { Emitter as SocketIOEmitter } from '@socket.io/redis-emitter';
import fg, { Entry } from 'fast-glob';
import { filesize } from 'filesize';
import path from 'path';

const sql = loadSqlEquiv(__filename);

export const WORKSPACE_SOCKET_NAMESPACE = '/workspace';

let socketIoServer: SocketIOServer | SocketIOEmitter | null = null;

export function init(io: SocketIOServer | SocketIOEmitter) {
  socketIoServer = io;
}

function emitMessageForWorkspace(workspaceId: string | number, event: string, ...args: any[]) {
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
 * Default options for calls to `fast-glob`.
 */
export const workspaceFastGlobDefaultOptions = {
  extglob: false,
  braceExpansion: false,
};
