import { Redis } from 'ioredis';

// Every script receives the queue's key prefix (`<prefix>:<queueName>`) as
// KEYS[1] and derives the keys it touches from it. This keeps the scripts
// simple, at the cost of not supporting Redis Cluster.
//
// Wait queues are one sorted set per group, scored by
// `priority * 2^32 + sequence` so that lower priorities run first and jobs
// with equal priority run in FIFO order. The sequence wraps at 2^32, which
// can briefly reorder jobs of equal priority once every ~4 billion enqueues.
// Group fairness comes from a rotation list of group ids: fetching rotates
// the list and takes the next group with capacity, so groups are served
// round-robin.

/**
 * Pushes a job onto its group's wait queue and makes sure the group is part of
 * the round-robin rotation. `prefix` and the named variables must be in scope.
 */
function pushToGroupLua(groupVar: string, jobIdVar: string, priorityExpr: string): string {
  return `
    local seq = redis.call('INCR', prefix .. ':seq')
    redis.call('ZADD', prefix .. ':group-wait:' .. ${groupVar}, ${priorityExpr} * 4294967296 + (seq % 4294967296), ${jobIdVar})
    if not redis.call('LPOS', prefix .. ':groups', ${groupVar}) then
      redis.call('RPUSH', prefix .. ':groups', ${groupVar})
    end`;
}

/** Wakes one blocked worker. The marker list is capped; stale markers are harmless. */
const addMarkerLua = `
    redis.call('LPUSH', prefix .. ':marker', '1')
    redis.call('LTRIM', prefix .. ':marker', 0, 99)`;

/** Drops a group from the rotation once it has no waiting and no active jobs. */
function cleanupGroupLua(groupVar: string): string {
  return `
    if tonumber(redis.call('HGET', prefix .. ':group-active', ${groupVar}) or '0') <= 0 and redis.call('ZCARD', prefix .. ':group-wait:' .. ${groupVar}) == 0 then
      redis.call('LREM', prefix .. ':groups', 0, ${groupVar})
      redis.call('HDEL', prefix .. ':group-active', ${groupVar})
    end`;
}

/** Trims a finished-jobs sorted set to `removeMode` entries, deleting evicted job data. */
function trimFinishedLua(setKeyExpr: string): string {
  return `
    if removeMode > 0 then
      local excess = redis.call('ZCARD', ${setKeyExpr}) - removeMode
      if excess > 0 then
        local evicted = redis.call('ZPOPMIN', ${setKeyExpr}, excess)
        for i = 1, #evicted, 2 do
          redis.call('DEL', prefix .. ':job:' .. evicted[i])
        end
      end
    end`;
}

// ARGV: jobId ('' = auto-generate), name, data, opts, timestamp, delay,
// priority, attempts, groupId.
// Returns {jobId, 1} if the job was created. If the id already existed, returns
// {jobId, 0, field1, value1, ...} with an atomic snapshot of the existing job.
const addJobLua = `
local prefix = KEYS[1]
local jobId = ARGV[1]
if jobId == '' then
  jobId = tostring(redis.call('INCR', prefix .. ':id'))
end
local jobKey = prefix .. ':job:' .. jobId
if redis.call('EXISTS', jobKey) == 1 then
  local reply = {jobId, 0}
  local fields = redis.call('HGETALL', jobKey)
  for i = 1, #fields do
    reply[#reply + 1] = fields[i]
  end
  return reply
end
redis.call(
  'HSET', jobKey,
  'id', jobId,
  'name', ARGV[2],
  'data', ARGV[3],
  'opts', ARGV[4],
  'timestamp', ARGV[5],
  'delay', ARGV[6],
  'priority', ARGV[7],
  'attempts', ARGV[8],
  'groupId', ARGV[9],
  'attemptsMade', '0',
  'stalledCount', '0'
)
if tonumber(ARGV[6]) > 0 then
  redis.call('ZADD', prefix .. ':delayed', tonumber(ARGV[5]) + tonumber(ARGV[6]), jobId)
else
  local groupId = ARGV[9]
  ${pushToGroupLua('groupId', 'jobId', 'tonumber(ARGV[7])')}
  ${addMarkerLua}
end
return {jobId, 1}
`;

// ARGV: jobId, include job ('1'/'0'). Returns {state, field1, value1, ...};
// fields are omitted when the job is unknown or the caller only requested the
// state. Reading the state and job together gives polling callers a consistent
// snapshot of completion results and failures.
const getJobStatusLua = `
local prefix = KEYS[1]
local jobId = ARGV[1]
local jobKey = prefix .. ':job:' .. jobId
local state
if redis.call('LPOS', prefix .. ':active', jobId) then
  state = 'active'
elseif redis.call('ZSCORE', prefix .. ':delayed', jobId) then
  state = 'delayed'
elseif redis.call('ZSCORE', prefix .. ':completed', jobId) then
  state = 'completed'
elseif redis.call('ZSCORE', prefix .. ':failed', jobId) then
  state = 'failed'
elseif redis.call('EXISTS', jobKey) == 1 then
  state = 'waiting'
else
  return {'unknown'}
end
if ARGV[2] == '0' then
  return {state}
end
local reply = {state}
local fields = redis.call('HGETALL', jobKey)
for i = 1, #fields do
  reply[#reply + 1] = fields[i]
end
return reply
`;

// ARGV: group concurrency (0 = unlimited). Returns the queue's configured
// value, setting it atomically when the first worker starts.
const configureGroupConcurrencyLua = `
local prefix = KEYS[1]
local key = prefix .. ':group-concurrency'
local configured = redis.call('GET', key)
if configured then
  return tonumber(configured)
end
redis.call('SET', key, ARGV[1])
return tonumber(ARGV[1])
`;

// ARGV: now, lock token, lock duration.
// Promotes due delayed jobs, then hands out the next job round-robin across
// groups. Returns nil if there is nothing to do, {'delayed', score} if the
// only remaining work is delayed, or {'job', field1, value1, ...} with the
// job's hash contents.
const moveToActiveLua = `
local prefix = KEYS[1]
if redis.call('EXISTS', prefix .. ':paused') == 1 then
  return nil
end
local now = tonumber(ARGV[1])
local delayedKey = prefix .. ':delayed'
local groupsKey = prefix .. ':groups'
local groupActiveKey = prefix .. ':group-active'

local due = redis.call('ZRANGEBYSCORE', delayedKey, '-inf', now, 'LIMIT', 0, 1000)
for i = 1, #due do
  local dueJobId = due[i]
  redis.call('ZREM', delayedKey, dueJobId)
  local dueGroupId = redis.call('HGET', prefix .. ':job:' .. dueJobId, 'groupId')
  if dueGroupId then
    local priority = tonumber(redis.call('HGET', prefix .. ':job:' .. dueJobId, 'priority') or '0')
    ${pushToGroupLua('dueGroupId', 'dueJobId', 'priority')}
  end
end

local limit = tonumber(redis.call('GET', prefix .. ':group-concurrency') or '0')
local groupCount = redis.call('LLEN', groupsKey)
for i = 1, groupCount do
  local groupId = redis.call('LMOVE', groupsKey, groupsKey, 'LEFT', 'RIGHT')
  if not groupId then break end
  local activeCount = tonumber(redis.call('HGET', groupActiveKey, groupId) or '0')
  if limit == 0 or activeCount < limit then
    local popped = redis.call('ZPOPMIN', prefix .. ':group-wait:' .. groupId)
    if #popped > 0 then
      local jobId = popped[1]
      local jobKey = prefix .. ':job:' .. jobId
      redis.call('HINCRBY', groupActiveKey, groupId, 1)
      redis.call('RPUSH', prefix .. ':active', jobId)
      redis.call('HSET', jobKey, 'processedOn', ARGV[1])
      redis.call('HINCRBY', jobKey, 'attemptsMade', 1)
      redis.call('SET', prefix .. ':lock:' .. jobId, ARGV[2], 'PX', ARGV[3])
      local reply = {'job'}
      local fields = redis.call('HGETALL', jobKey)
      for j = 1, #fields do
        reply[#reply + 1] = fields[j]
      end
      return reply
    elseif activeCount == 0 then
      redis.call('LREM', groupsKey, -1, groupId)
      redis.call('HDEL', groupActiveKey, groupId)
    end
  end
end

local nextDelayed = redis.call('ZRANGE', delayedKey, 0, 0, 'WITHSCORES')
if #nextDelayed > 0 then
  return {'delayed', nextDelayed[2]}
end
return nil
`;

// ARGV: jobId, lock token, returnvalue, now, removeMode (0 = keep all,
// -1 = remove immediately, N > 0 = keep the N most recent).
// Returns 0 on success, -1 if the lock was lost.
const moveToCompletedLua = `
local prefix = KEYS[1]
local jobId = ARGV[1]
local jobKey = prefix .. ':job:' .. jobId
local lockKey = prefix .. ':lock:' .. jobId
if redis.call('GET', lockKey) ~= ARGV[2] then
  return -1
end
redis.call('DEL', lockKey)
redis.call('LREM', prefix .. ':active', 1, jobId)
local groupId = redis.call('HGET', jobKey, 'groupId') or ''
redis.call('HINCRBY', prefix .. ':group-active', groupId, -1)
if redis.call('ZCARD', prefix .. ':group-wait:' .. groupId) > 0 then
  ${addMarkerLua}
end
${cleanupGroupLua('groupId')}
local removeMode = tonumber(ARGV[5])
if removeMode == -1 then
  redis.call('DEL', jobKey)
else
  redis.call('HSET', jobKey, 'returnvalue', ARGV[3], 'finishedOn', ARGV[4])
  redis.call('ZADD', prefix .. ':completed', tonumber(ARGV[4]), jobId)
  ${trimFinishedLua("prefix .. ':completed'")}
end
return 0
`;

// ARGV: jobId, lock token, failedReason, now, willRetry ('1'/'0'),
// retryDelay, removeMode.
// Returns 1 if the job was requeued for a retry, 0 if it was moved to
// failed, or -1 if the lock was lost.
const moveToFailedLua = `
local prefix = KEYS[1]
local jobId = ARGV[1]
local jobKey = prefix .. ':job:' .. jobId
local lockKey = prefix .. ':lock:' .. jobId
if redis.call('GET', lockKey) ~= ARGV[2] then
  return -1
end
redis.call('DEL', lockKey)
redis.call('LREM', prefix .. ':active', 1, jobId)
local groupId = redis.call('HGET', jobKey, 'groupId') or ''
redis.call('HINCRBY', prefix .. ':group-active', groupId, -1)
if redis.call('ZCARD', prefix .. ':group-wait:' .. groupId) > 0 then
  ${addMarkerLua}
end
redis.call('HSET', jobKey, 'failedReason', ARGV[3])
local requeued = 0
if ARGV[5] == '1' then
  requeued = 1
  if tonumber(ARGV[6]) > 0 then
    redis.call('ZADD', prefix .. ':delayed', tonumber(ARGV[4]) + tonumber(ARGV[6]), jobId)
  else
    local priority = tonumber(redis.call('HGET', jobKey, 'priority') or '0')
    ${pushToGroupLua('groupId', 'jobId', 'priority')}
    ${addMarkerLua}
  end
else
  local removeMode = tonumber(ARGV[7])
  if removeMode == -1 then
    redis.call('DEL', jobKey)
  else
    redis.call('HSET', jobKey, 'finishedOn', ARGV[4])
    redis.call('ZADD', prefix .. ':failed', tonumber(ARGV[4]), jobId)
    ${trimFinishedLua("prefix .. ':failed'")}
  end
end
${cleanupGroupLua('groupId')}
return requeued
`;

// ARGV: jobId, lock token, lock duration.
// Returns 1 if the lock was extended, 0 if it was lost.
const extendLockLua = `
local prefix = KEYS[1]
local lockKey = prefix .. ':lock:' .. ARGV[1]
if redis.call('GET', lockKey) == ARGV[2] then
  return redis.call('PEXPIRE', lockKey, ARGV[3])
end
return 0
`;

// ARGV: maxStalledCount, now.
// Finds active jobs whose locks have expired. Each such job is requeued into
// its group, or moved to failed once it has stalled more than
// maxStalledCount times. Returns {requeuedJobIds, failedJobIds}.
const checkStalledLua = `
local prefix = KEYS[1]
local maxStalledCount = tonumber(ARGV[1])
local requeued = {}
local failed = {}
local activeJobs = redis.call('LRANGE', prefix .. ':active', 0, -1)
for i = 1, #activeJobs do
  local jobId = activeJobs[i]
  if redis.call('EXISTS', prefix .. ':lock:' .. jobId) == 0 then
    redis.call('LREM', prefix .. ':active', 1, jobId)
    local jobKey = prefix .. ':job:' .. jobId
    local groupId = redis.call('HGET', jobKey, 'groupId')
    if groupId then
      redis.call('HINCRBY', prefix .. ':group-active', groupId, -1)
      local stalledCount = redis.call('HINCRBY', jobKey, 'stalledCount', 1)
      if stalledCount > maxStalledCount then
        local opts = cjson.decode(redis.call('HGET', jobKey, 'opts') or '{}')
        local removeOnFail = opts['removeOnFail']
        local removeMode = 0
        if removeOnFail == true then
          removeMode = -1
        elseif type(removeOnFail) == 'number' and removeOnFail > 0 then
          removeMode = math.floor(removeOnFail)
        end
        if removeMode == -1 then
          redis.call('DEL', jobKey)
        else
          redis.call('HSET', jobKey, 'failedReason', 'job stalled more than allowable limit', 'finishedOn', ARGV[2])
          redis.call('ZADD', prefix .. ':failed', tonumber(ARGV[2]), jobId)
          ${trimFinishedLua("prefix .. ':failed'")}
        end
        failed[#failed + 1] = jobId
      else
        local priority = tonumber(redis.call('HGET', jobKey, 'priority') or '0')
        ${pushToGroupLua('groupId', 'jobId', 'priority')}
        requeued[#requeued + 1] = jobId
      end
      ${cleanupGroupLua('groupId')}
    end
  end
end
if #requeued > 0 then
  ${addMarkerLua}
end
return {requeued, failed}
`;

// Returns {waiting, active, delayed, completed, failed}.
const getCountsLua = `
local prefix = KEYS[1]
local groups = redis.call('LRANGE', prefix .. ':groups', 0, -1)
local waiting = 0
for i = 1, #groups do
  waiting = waiting + redis.call('ZCARD', prefix .. ':group-wait:' .. groups[i])
end
return {
  waiting,
  redis.call('LLEN', prefix .. ':active'),
  redis.call('ZCARD', prefix .. ':delayed'),
  redis.call('ZCARD', prefix .. ':completed'),
  redis.call('ZCARD', prefix .. ':failed'),
}
`;

// Returns a flat list of {groupId, waiting, active} triples.
const getGroupsLua = `
local prefix = KEYS[1]
local groups = redis.call('LRANGE', prefix .. ':groups', 0, -1)
local reply = {}
for i = 1, #groups do
  local groupId = groups[i]
  reply[#reply + 1] = groupId
  reply[#reply + 1] = tostring(redis.call('ZCARD', prefix .. ':group-wait:' .. groupId))
  reply[#reply + 1] = redis.call('HGET', prefix .. ':group-active', groupId) or '0'
end
return reply
`;

// ARGV: includeDelayed ('1'/'0'). Removes all waiting (and optionally
// delayed) jobs. Returns the number of removed jobs.
const drainLua = `
local prefix = KEYS[1]
local removed = 0
local groups = redis.call('LRANGE', prefix .. ':groups', 0, -1)
for i = 1, #groups do
  local groupId = groups[i]
  local waitKey = prefix .. ':group-wait:' .. groupId
  local jobs = redis.call('ZRANGE', waitKey, 0, -1)
  for j = 1, #jobs do
    redis.call('DEL', prefix .. ':job:' .. jobs[j])
    removed = removed + 1
  end
  redis.call('DEL', waitKey)
  if tonumber(redis.call('HGET', prefix .. ':group-active', groupId) or '0') <= 0 then
    redis.call('LREM', prefix .. ':groups', 0, groupId)
    redis.call('HDEL', prefix .. ':group-active', groupId)
  end
end
if ARGV[1] == '1' then
  local delayedJobs = redis.call('ZRANGE', prefix .. ':delayed', 0, -1)
  for j = 1, #delayedJobs do
    redis.call('DEL', prefix .. ':job:' .. delayedJobs[j])
    removed = removed + 1
  end
  redis.call('DEL', prefix .. ':delayed')
end
return removed
`;

interface PrairieMQCommands {
  pmqAddJob(
    prefix: string,
    jobId: string,
    name: string,
    data: string,
    opts: string,
    timestamp: number,
    delay: number,
    priority: number,
    attempts: number,
    groupId: string,
  ): Promise<[string, number, ...string[]]>;
  pmqGetJobStatus(prefix: string, jobId: string, includeJob: number): Promise<string[]>;
  pmqConfigureGroupConcurrency(prefix: string, groupConcurrency: number): Promise<number>;
  pmqMoveToActive(
    prefix: string,
    now: number,
    token: string,
    lockDuration: number,
  ): Promise<string[] | null>;
  pmqMoveToCompleted(
    prefix: string,
    jobId: string,
    token: string,
    returnvalue: string,
    now: number,
    removeMode: number,
  ): Promise<number>;
  pmqMoveToFailed(
    prefix: string,
    jobId: string,
    token: string,
    failedReason: string,
    now: number,
    willRetry: number,
    retryDelay: number,
    removeMode: number,
  ): Promise<number>;
  pmqExtendLock(prefix: string, jobId: string, token: string, duration: number): Promise<number>;
  pmqCheckStalled(
    prefix: string,
    maxStalledCount: number,
    now: number,
  ): Promise<[string[], string[]]>;
  pmqGetCounts(prefix: string): Promise<[number, number, number, number, number]>;
  pmqGetGroups(prefix: string): Promise<string[]>;
  pmqDrain(prefix: string, includeDelayed: number): Promise<number>;
}

export type PrairieMQRedis = Redis & PrairieMQCommands;

const scripts: Record<keyof PrairieMQCommands, string> = {
  pmqAddJob: addJobLua,
  pmqGetJobStatus: getJobStatusLua,
  pmqConfigureGroupConcurrency: configureGroupConcurrencyLua,
  pmqMoveToActive: moveToActiveLua,
  pmqMoveToCompleted: moveToCompletedLua,
  pmqMoveToFailed: moveToFailedLua,
  pmqExtendLock: extendLockLua,
  pmqCheckStalled: checkStalledLua,
  pmqGetCounts: getCountsLua,
  pmqGetGroups: getGroupsLua,
  pmqDrain: drainLua,
};

export function createScriptedClient(redisUrl: string): PrairieMQRedis {
  const client = new Redis(redisUrl, { maxRetriesPerRequest: null });
  for (const [name, lua] of Object.entries(scripts)) {
    client.defineCommand(name, { numberOfKeys: 1, lua });
  }
  return client as PrairieMQRedis;
}
