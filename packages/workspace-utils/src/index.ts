import { queryAsync } from '@prairielearn/postgres';
import type { Namespace } from 'socket.io';

export interface WorkspaceUpdater {
  /**
   * Updates a workspace's current message.
   *
   * @param id The workspace's id.
   * @param message The workspace's new message.
   * @param toDatabase Whether to write the message to the database.
   */
  updateMessage(
    workspace_id: string | number,
    message: string,
    toDatabase?: boolean
  ): Promise<void>;
  /**
   * Updates a workspace's current state and message.
   *
   * @param id The workspace's id.
   * @param state The workspace's new state.
   * @param message The workspace's new message.
   */
  updateState(workspace_id: string | number, state: string, message?: string): Promise<void>;
}

export function createUpdater(namespace: Namespace): WorkspaceUpdater {
  function emitMessageForWorkspace(workspaceId: string | number, event: string, ...args: any[]) {
    namespace.to(`workspace-${workspaceId}`).emit(event, ...args);
  }

  return {
    async updateMessage(workspace_id, message, toDatabase = true) {
      if (toDatabase) await queryAsync(sql.update_workspace_message, { workspace_id, message });
      emitMessageForWorkspace(workspace_id, 'change:message', {
        workspace_id,
        message,
      });
    },
    async updateState(workspace_id, state, message = '') {
      // TODO: add locking
      await queryAsync(sql.update_workspace_state, { workspace_id, state, message });
      emitMessageForWorkspace(workspace_id, 'change:state', {
        workspace_id,
        state,
        message,
      });
    },
  };
}
