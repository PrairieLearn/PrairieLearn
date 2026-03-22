import assert from 'node:assert';

import type { Namespace, Socket } from 'socket.io';

import { Cache } from '@prairielearn/cache';

import { checkJobSequenceToken } from './checkJobSequenceToken.js';
import { config } from './config.js';
import { ensureProps } from './ensureProps.js';
import {
  type ClientConnectMessage,
  type JobProgress,
  JobProgressSchema,
  type ProgressUpdateMessage,
} from './serverJobProgressSocket.shared.js';
import * as socketServer from './socket-server.js';

/**
 * Manages live progress information for server jobs.
 */
let serverJobProgressCache: Cache | undefined;

async function getServerJobProgressCache(): Promise<Cache> {
  if (serverJobProgressCache) return serverJobProgressCache;
  serverJobProgressCache = new Cache();
  await serverJobProgressCache.init({
    type: config.nonVolatileCacheType,
    keyPrefix: config.cacheKeyPrefix,
    redisUrl: config.nonVolatileRedisUrl,
  });
  return serverJobProgressCache;
}

let namespace: Namespace;

export function init() {
  assert(socketServer.io);
  namespace = socketServer.io.of('/server-job-progress');
  namespace.on('connection', connection);
}

function connection(socket: Socket) {
  socket.on('joinServerJobProgress', async (msg: ClientConnectMessage, callback) => {
    if (
      !ensureProps({
        data: msg,
        props: ['job_sequence_id', 'job_sequence_token'],
        socketName: 'server job progress',
      })
    ) {
      return callback(null);
    }

    if (!checkJobSequenceToken(msg.job_sequence_token, msg.job_sequence_id)) {
      return callback(null);
    }

    void socket.join(`server-job-progress-${msg.job_sequence_id}`);

    const serverJobProgressCache = await getServerJobProgressCache();
    const progress = await serverJobProgressCache.get(`server-job-progress-${msg.job_sequence_id}`);

    if (!progress) {
      // No progress data found.

      // If the job sequence is still running according to the database,
      // this indicates that the job may have crashed without updating progress
      // or status in the database.

      return callback({
        job_sequence_id: msg.job_sequence_id,
        has_progress_data: false,
      } satisfies ProgressUpdateMessage);
    }

    const result = JobProgressSchema.safeParse(progress);
    if (!result.success) {
      return callback(null);
    }
    const progressData = result.data;

    callback({
      job_sequence_id: msg.job_sequence_id,
      has_progress_data: true,
      num_complete: progressData.num_complete,
      num_failed: progressData.num_failed,
      num_total: progressData.num_total,
      job_failure_message: progressData.job_failure_message,
      item_statuses: progressData.item_statuses,
    } satisfies ProgressUpdateMessage);
  });
}

/**
 * Emits a server job progress update event for the specified job sequence ID.
 */
export async function emitServerJobProgressUpdate(progress: JobProgress) {
  namespace.to(`server-job-progress-${progress.job_sequence_id}`).emit('serverJobProgressUpdate', {
    ...progress,
    has_progress_data: true,
  } satisfies ProgressUpdateMessage);
  const cache = await getServerJobProgressCache();
  cache.set(
    `server-job-progress-${progress.job_sequence_id}`,
    progress,
    5 * 60 * 1000, // 5 minutes
  );
}
