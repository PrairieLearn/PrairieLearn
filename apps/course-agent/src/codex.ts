import type { DirectoryBackup, getSandbox } from '@cloudflare/sandbox';

import type { CleanupDiagnostics, PendingTool } from '@prairielearn/course-agent-contract';

import { AppServer } from './app-server.js';
import { safeFailure } from './cleanup-error.js';

export type CodexSandbox = ReturnType<typeof getSandbox>;
export const SANDBOX_IDLE_MS = 10 * 60_000;
export const USER_IDLE_MS = 6 * 60 * 60_000;
const SERVER_ID = 'codex-app-server';
const SERVER_PORT = 4500;
const readyFile = '/tmp/codex-app-server-ready';
const tokenFile = '/tmp/codex-app-server-token';
export interface Run {
  id: string;
  messageId: string;
  sandboxId: string;
  threadId?: string;
  turnId?: string;
  /** Set before turn/start: a disconnect after this point requires native reconciliation. */
  submitted?: boolean;
  /** Native acknowledgment or correlated native history proves the prompt arrived. */
  accepted?: boolean;
  /** Stop during startup is applied before submitting native work. */
  cancelRequested?: boolean;
  status: 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
}
/** Chat DO metadata is durable separately from the Linux filesystem; R2 checkpoints preserve that filesystem and native Codex history. */
export interface CodexState {
  rejectedDispatches?: Record<string, true>;
  repository?: { repository: string; branch: string };
  usageTotal?: {
    threadId: string;
    input: number;
    cached: number;
    cacheWrite?: number;
    output: number;
  };
  /**
   * Prompt/continuation receipts correlate acceptance and incremental token totals.
   * Terminal entries are archived to SQLite, so broadcasts stay bounded without
   * forgetting an old dispatch when PL reconciles usage or retries a request.
   */
  executions?: Record<
    string,
    {
      dispatchId?: string;
      status: Run['status'];
      model: string;
      input: number | null;
      cached: number | null;
      cacheWrite?: number | null;
      output: number | null;
    }
  >;
  /**
   * Corrections belong to an existing turn. Persist before sending turn/steer:
   * after a lost acknowledgment native history decides whether it was accepted.
   */
  steering?: Record<string, { sandboxId: string; threadId: string; accepted: boolean }>;
  /** Captured tool arguments outlive the socket/container while PL waits for approval. */
  pendingTool?: PendingTool;
  toolSequence?: number;
  /** Completed results fence retries after a lost native result-delivery acknowledgment. */
  toolReceipts?: Record<string, string | { result: string; success: boolean }>;
  sandbox?: {
    id: string;
    phase:
      | 'starting'
      | 'waiting_for_agent'
      | 'waiting_for_user'
      | 'suspending'
      | 'destroying'
      | 'cleanup_failed';
    lastUserInteractionAt: number;
    waitingSince?: number;
    deadlineSchedule?: string;
    cleanup?: CleanupDiagnostics;
  };
  run?: Run;
  threadId?: string;
  checkpoint?: {
    backup: DirectoryBackup;
    threadId?: string;
    usageTotal?: CodexState['usageTotal'];
  };
  obsoleteCheckpoints?: string[];
  lastCheckpointError?: string;
}
export class ContainerLost extends Error {
  constructor() {
    super('Sandbox was lost. Send another message to restore the last checkpoint.');
  }
}

/**
 * Reuse a warm app-server, or restore/configure a cold sandbox and authenticate its private socket.
 * Recovery mode only inspects surviving execution; it must never launch replacement work.
 */
export async function connectCodex(
  sandbox: CodexSandbox,
  state: CodexState,
  {
    repository,
    branch,
    recovery = false,
    onCheckpointUnavailable = (_warning: string) => {},
  }: {
    repository?: string;
    branch?: string;
    recovery?: boolean;
    onCheckpointUnavailable?: (warning: string) => void;
  } = {},
) {
  try {
    if (repository) await sandbox.setOutboundByHost('github.com', 'github', { repository });
    const warm = (await sandbox.exists(readyFile)).exists;
    if (!warm && recovery) throw new ContainerLost();
    let threadId = state.threadId;
    let warning: string | undefined;
    if (!warm) {
      let restored = false;
      if (state.checkpoint) {
        const { backup } = state.checkpoint;
        try {
          await sandbox.restoreBackup(backup);
          restored = true;
        } catch (error) {
          // RPC preserves SDK error names, not subclass identity. Temporary outages must retain the checkpoint.
          if (
            !(error instanceof Error) ||
            !['BackupNotFoundError', 'BackupExpiredError'].includes(error.name)
          ) {
            throw error;
          }
          warning =
            'The checkpoint is missing or expired. Recovery requires an explicit new conversation; the saved PL outcome is unchanged.';
          onCheckpointUnavailable(warning);
          // Deliberately omit the SDK cause: it can contain signed URLs or secrets.
          // eslint-disable-next-line preserve-caught-error
          throw new Error(warning);
        }
      }
      if (!restored) {
        if (repository && !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
          throw new Error('Invalid configured GitHub repository.');
        }
        if (!branch || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes('..')) {
          throw new Error('Invalid course branch.');
        }
        // The outbound handler injects credentials and uses HTTPS upstream; local sandbox TLS interception is unavailable.
        const initialized = await sandbox.exec(
          repository
            ? `mkdir -p /workspace/codex && git clone --branch ${JSON.stringify(branch)} -- http://github.com/${repository}.git /workspace/repo`
            : 'mkdir -p /workspace/repo /workspace/codex && git init /workspace/repo',
          { timeout: 60_000 },
        );
        if (!initialized.success) {
          throw new Error(
            `Could not initialize Git workspace (exit ${initialized.exitCode}). Check that the configured repository exists and GITHUB_CLIENT_TOKEN has access to it.`,
          );
        }
      }
      threadId = restored ? state.checkpoint?.threadId : undefined;
      const configured = await sandbox.exec(
        'git -C /workspace/repo config user.name Codex && git -C /workspace/repo config user.email codex@users.noreply.github.com && cp /opt/codex-config.toml /workspace/codex/config.toml',
        {
          timeout: 60_000,
        },
      );
      if (!configured.success) throw new Error('Could not configure Codex.');
      await sandbox.writeFile(tokenFile, crypto.randomUUID());
      await sandbox.writeFile(readyFile, 'ready');
    }
    const process = await sandbox.getProcess(SERVER_ID);
    if (!process || !['running', 'starting'].includes(process.status)) {
      if (recovery) throw new ContainerLost();
      if (process) await sandbox.cleanupCompletedProcesses();
      const server = await sandbox.startProcess(
        `codex app-server --listen ws://0.0.0.0:${SERVER_PORT} --ws-auth capability-token --ws-token-file ${tokenFile}`,
        {
          processId: SERVER_ID,
          autoCleanup: false,
          env: { CODEX_HOME: '/workspace/codex' },
        },
      );
      await server.waitForPort(SERVER_PORT, {
        path: '/readyz',
        timeout: 60_000,
      });
    } else if (process.status === 'starting') {
      await process.waitForPort(SERVER_PORT, {
        path: '/readyz',
        timeout: 60_000,
      });
    }
    const { content: token } = await sandbox.readFile(tokenFile);
    const response = await sandbox.wsConnect(
      new Request('http://sandbox/', {
        headers: {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          Authorization: `Bearer ${token}`,
        },
      }),
      SERVER_PORT,
    );
    if (!response.webSocket) {
      throw new Error(`Could not connect to Codex app-server (HTTP ${response.status}).`);
    }
    response.webSocket.accept();
    const client = new AppServer(response.webSocket);
    try {
      await client.initialize();
    } catch (error) {
      client.close();
      throw error;
    }
    return { client, threadId, warning };
  } catch (error) {
    // Preserve the recovery signal; sanitize SDK failures once before they reach chat history.
    if (error instanceof ContainerLost) throw error;
    // Deliberately omit the SDK cause before the error reaches history or logs.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`Sandbox startup failed. ${safeFailure(error)}`);
  }
}

/** Archive the workspace through the Sandbox SDK; credentials are injected outside these files. */
export function checkpointCodex(sandbox: CodexSandbox, localBucket = false) {
  return sandbox.createBackup({
    dir: '/workspace',
    localBucket,
    ttl: 7 * 24 * 60 * 60,
    // SDK 0.12.9 expands slash-containing patterns in a way that excludes the parent.
    excludes: ['auth.json'],
  });
}
