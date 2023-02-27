import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';
import type { Server as SocketIOServer } from 'socket.io';

const sql = loadSqlEquiv(__filename);

let socketIoServer: SocketIOServer | null = null;

export function init(io: SocketIOServer) {
  socketIoServer = io;
}

function emitMessageForWorkspace(workspaceId: string | number, event: string, ...args: any[]) {
  getSocketNamespace()
    .to(`workspace-${workspaceId}`)
    .emit(event, ...args);
}

export function getSocketNamespace() {
  if (!socketIoServer) throw new Error('socket.io server not initialized');
  return socketIoServer.of('/workspace');
}

/**
 * Updates a workspace's current message.
 *
 * @param id The workspace's id.
 * @param message The workspace's new message.
 * @param toDatabase Whether to write the message to the database.
 */
export async function updateMessage(
  workspace_id: string | number,
  message: string,
  toDatabase: boolean = true
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
export async function updateState(
  workspace_id: string | number,
  state: string,
  message: string = ''
): Promise<void> {
  // TODO: add locking
  await queryAsync(sql.update_workspace_state, { workspace_id, state, message });
  emitMessageForWorkspace(workspace_id, 'change:state', {
    workspace_id,
    state,
    message,
  });
}
