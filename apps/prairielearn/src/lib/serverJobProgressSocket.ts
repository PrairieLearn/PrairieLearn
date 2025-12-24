
import assert from 'node:assert';
import * as socketServer from './socket-server.js';
import type { Namespace, Socket } from 'socket.io';
import { ensureProps } from './ensureProps.js';
import { StatusMessageWithProgressSchema, type StatusMessage, type StatusMessageWithProgress } from './serverJobProgressSocket.shared.js';
import { Cache } from '@prairielearn/cache';
import { config } from './config.js';
import { checkJobSequenceToken } from './checkJobSequenceToken.js';

let serverJobProgressCache: Cache | undefined;
export async function getServerJobProgressCache(): Promise<Cache> {
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

export function connection(socket: Socket) {
    socket.on('joinServerJobProgress', async (msg: StatusMessage, callback) => {
        if (!ensureProps(msg, ['job_sequence_id', 'job_sequence_token'])) {
            return callback(null);
        }

        console.log('msg', msg.job_sequence_token);

        if (!checkJobSequenceToken(msg.job_sequence_token, msg.job_sequence_id)) {
            return callback(null);
        }

        void socket.join(`server-job-${msg.job_sequence_id}`);

        const serverJobProgressCache = await getServerJobProgressCache();
        const progress = await serverJobProgressCache.get(`server-job-progress-${msg.job_sequence_id}`);

        if (!progress) {
            return callback({
                job_sequence_id: msg.job_sequence_id,
                valid: false,
                num_complete: 0,
                num_failed: 0,
                num_total: 0,
            } satisfies StatusMessageWithProgress);
        }

        const result = StatusMessageWithProgressSchema.safeParse(progress);
        if (!result.success) {
            return callback(null);
        }
        const progressData = result.data;

        callback({
            job_sequence_id: msg.job_sequence_id,
            valid: true,
            num_complete: progressData.num_complete,
            num_failed: progressData.num_failed,
            num_total: progressData.num_total,
            item_statuses: progressData.item_statuses
        } satisfies StatusMessageWithProgress);
    })
}

// Emit progress updates to clients
export async function emitServerJobProgressUpdate(progress: StatusMessageWithProgress) {
    namespace
        .to(`server-job-${progress.job_sequence_id}`)
        .emit('serverJobProgressUpdate', progress);        
    await serverJobProgressCache?.set(
        `server-job-progress-${progress.job_sequence_id}`,
        progress,
        5 * 60 * 1000, // 5 minutes
    )
}