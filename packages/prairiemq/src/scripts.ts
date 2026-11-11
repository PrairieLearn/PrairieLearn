import { Redis } from 'ioredis';

const MINIMUM_REDIS_VERSION = '6.2.0';
export const REDIS_COMMAND_TIMEOUT = 10_000;
const FETCH_SESSION_TTL = 24 * 60 * 60 * 1000;
const DELAYED_SEQUENCE_WIDTH = 20;
const PRIORITY_SEQUENCE_WIDTH = 20;
const RETENTION_CLEANUP_BATCH_SIZE = 100;

export class RedisCompatibilityError extends Error {}

function waitForRedisReady(client: Redis): Promise<void> {
  if (client.status === 'ready') return Promise.resolve();
  if (client.status === 'end') return Promise.reject(new Error('Redis connection has closed'));

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      client.off('ready', onReady);
      client.off('error', onError);
      client.off('end', onEnd);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('Redis connection closed before becoming ready'));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Redis connection did not become ready within ${REDIS_COMMAND_TIMEOUT}ms`));
    }, REDIS_COMMAND_TIMEOUT);
    client.on('ready', onReady);
    client.on('error', onError);
    client.on('end', onEnd);
  });
}

// Every script receives the queue's tagged base (`<prefix>:{<prefix>:<queueName>}`)
// as KEYS[1] and derives every key it touches from it. A queue is therefore one
// atomic Redis slot-affinity domain. This does not add Redis Cluster support,
// and deriving keys instead of declaring each one in KEYS is a deliberate
// portability constraint that future Cluster support must test and document.
//
// Wait queues are one sorted set per group, scored by a sequence number so
// ready jobs in a group run in FIFO order. Positive priorities use a separate
// sorted set, scored by priority with fixed-width sequence prefixes for FIFO
// ties. Priority-zero jobs run before positive priorities. Delayed jobs are scored by due time;
// a fixed-width sequence prefix on each member orders equal due times.
// Group fairness comes from a rotation list of group ids: fetching rotates
// the list with LMOVE and takes the next group with capacity, so groups are
// served round-robin. A companion set provides constant-time rotation-list
// membership checks when adding groups. LMOVE requires Redis 6.2.

async function assertMinimumRedisVersion(client: Redis): Promise<void> {
  const info = await client.info('server');
  const match = info.match(/^redis_version:(\d+)\.(\d+)\.(\d+)/m);
  if (!match) {
    throw new RedisCompatibilityError('PrairieMQ could not determine the Redis server version');
  }

  const version = match.slice(1).map(Number);
  const minimum = MINIMUM_REDIS_VERSION.split('.').map(Number);
  for (let i = 0; i < minimum.length; i++) {
    if (version[i] > minimum[i]) return;
    if (version[i] < minimum[i]) {
      throw new RedisCompatibilityError(
        `PrairieMQ requires Redis ${MINIMUM_REDIS_VERSION} or later; connected server is ${version.join('.')}`,
      );
    }
  }
}

export async function ensureSelectedDatabase(client: Redis): Promise<void> {
  const database = client.options.db ?? 0;
  if (database !== 0) {
    await client.select(database);
  }
}

/**
 * Pushes a job onto its group's wait queue and makes sure the group is part of
 * the round-robin rotation. `prefix` and the named variables must be in scope.
 */
function pushToGroupLua(groupVar: string, jobIdVar: string): string {
  return `
    local waitingJobKey = prefix .. ':job:' .. ${jobIdVar}
    local waitingOptions = cjson.decode(redis.call('HGET', waitingJobKey, 'opts') or '{}')
    local priority = waitingOptions['priority'] or 0
    if priority > 0 then
      redis.call('INCR', prefix .. ':priority-seq')
      local sequence = redis.call('GET', prefix .. ':priority-seq')
      local member = string.rep('0', ${PRIORITY_SEQUENCE_WIDTH} - string.len(sequence)) .. sequence .. ':' .. ${jobIdVar}
      redis.call('HSET', waitingJobKey, 'priorityMember', member)
      redis.call('ZADD', prefix .. ':group-priority:' .. ${groupVar}, priority, member)
    else
      local seq = redis.call('INCR', prefix .. ':seq')
      redis.call('ZADD', prefix .. ':group-wait:' .. ${groupVar}, seq, ${jobIdVar})
    end
    if redis.call('SADD', prefix .. ':group-members', ${groupVar}) == 1 then
      redis.call('RPUSH', prefix .. ':groups', ${groupVar})
    end`;
}

function groupWaitingCountLua(groupVar: string): string {
  return `(redis.call('ZCARD', prefix .. ':group-wait:' .. ${groupVar}) + redis.call('ZCARD', prefix .. ':group-priority:' .. ${groupVar}))`;
}

/** Wakes one blocked worker. The marker list is capped; stale markers are harmless. */
const addMarkerLua = `
    redis.call('LPUSH', prefix .. ':marker', '1')
    redis.call('LTRIM', prefix .. ':marker', 0, 99)`;

const redisTimeLua = `
local serverTime = redis.call('TIME')
local now = tonumber(serverTime[1]) * 1000 + math.floor(tonumber(serverTime[2]) / 1000)`;

/** Drops a group from the rotation once it has no waiting and no active jobs. */
function cleanupGroupLua(groupVar: string): string {
  return `
    if tonumber(redis.call('HGET', prefix .. ':group-active', ${groupVar}) or '0') <= 0 and ${groupWaitingCountLua(groupVar)} == 0 then
      redis.call('LREM', prefix .. ':groups', 0, ${groupVar})
      redis.call('SREM', prefix .. ':group-members', ${groupVar})
      redis.call('HDEL', prefix .. ':group-active', ${groupVar})
    end`;
}

/** Removes a job's deduplication key if it still points at that job. */
function removeDeduplicationLua(jobKeyVar: string, jobIdVar: string): string {
  return `
    local deduplicationId = redis.call('HGET', ${jobKeyVar}, 'deduplicationId')
    if deduplicationId and deduplicationId ~= '' then
      local deduplicationKey = prefix .. ':deduplication:' .. deduplicationId
      if redis.call('GET', deduplicationKey) == ${jobIdVar} then
        redis.call('DEL', deduplicationKey)
      end
    end`;
}

/** Deletes a job and its deduplication mapping. */
function deleteJobLua(jobKeyVar: string, jobIdVar: string): string {
  return `
    ${removeDeduplicationLua(jobKeyVar, jobIdVar)}
    redis.call('DEL', ${jobKeyVar})`;
}

/** Adds a delayed entry ordered by due time, then by the exact Redis scheduling sequence. */
function addDelayedJobLua(jobKeyVar: string, jobIdVar: string, dueTimeExpr: string): string {
  return `
    redis.call('INCR', prefix .. ':delayed-seq')
    local delayedSequence = redis.call('GET', prefix .. ':delayed-seq')
    local delayedMember =
      string.rep('0', ${DELAYED_SEQUENCE_WIDTH} - string.len(delayedSequence)) ..
      delayedSequence .. ':' .. ${jobIdVar}
    redis.call('HSET', ${jobKeyVar}, 'delayedMember', delayedMember)
    redis.call('ZADD', prefix .. ':delayed', math.min(${dueTimeExpr}, ${Number.MAX_SAFE_INTEGER}), delayedMember)`;
}

/**
 * Numeric retention records a finite score cutoff. Cleanup advances through
 * that cutoff in fixed-size batches, so a large history never creates one
 * unbounded Redis script. The cutoff and wake marker make continuation durable.
 */
const finishedJobsFunctionsLua = `
local function trimFinishedJobsBatch(prefix, setKey, limit)
  local cutoffKey = setKey .. ':trim-cutoff'
  local cutoff = redis.call('GET', cutoffKey)
  if not cutoff then return false end

  if limit > 0 then
    local candidates = redis.call(
      'ZRANGEBYSCORE', setKey, '-inf', cutoff, 'LIMIT', 0, limit
    )
    for i = 1, #candidates do
      local evictedJobId = candidates[i]
      local evictedJobKey = prefix .. ':job:' .. evictedJobId
      redis.call('ZREM', setKey, evictedJobId)
      ${deleteJobLua('evictedJobKey', 'evictedJobId')}
    end
  end

  if redis.call('ZCOUNT', setKey, '-inf', cutoff) == 0 then
    redis.call('DEL', cutoffKey)
    return false
  end
  return true
end

local function requestFinishedJobsTrim(prefix, setKey, removeMode, immediateLimit)
  local excess = redis.call('ZCOUNT', setKey, '-inf', '(+inf') - removeMode
  local cutoffKey = setKey .. ':trim-cutoff'
  if excess > 0 then
    local requested = redis.call('ZRANGE', setKey, excess - 1, excess - 1, 'WITHSCORES')
    if #requested > 0 then
      local current = redis.call('GET', cutoffKey)
      if not current or tonumber(requested[2]) > tonumber(current) then
        redis.call('SET', cutoffKey, requested[2])
      end
    end
  end

  if immediateLimit > 0 and trimFinishedJobsBatch(prefix, setKey, immediateLimit) then
    ${addMarkerLua}
  end
end

local function trimNextFinishedJobsBatch(prefix, limit)
  local completedTrimKey = prefix .. ':completed:trim-cutoff'
  local failedTrimKey = prefix .. ':failed:trim-cutoff'
  local completedTrimPending = redis.call('EXISTS', completedTrimKey) == 1
  local failedTrimPending = redis.call('EXISTS', failedTrimKey) == 1
  local nextTrimKey = prefix .. ':retention-trim-next'
  if not completedTrimPending and not failedTrimPending then
    redis.call('DEL', nextTrimKey)
    return false
  end

  local trimSetKey = nil
  if completedTrimPending and failedTrimPending then
    if redis.call('GET', nextTrimKey) == 'failed' then
      trimSetKey = prefix .. ':failed'
      redis.call('SET', nextTrimKey, 'completed')
    else
      trimSetKey = prefix .. ':completed'
      redis.call('SET', nextTrimKey, 'failed')
    end
  elseif completedTrimPending then
    trimSetKey = prefix .. ':completed'
  else
    trimSetKey = prefix .. ':failed'
  end

  trimFinishedJobsBatch(prefix, trimSetKey, limit)
  completedTrimPending = redis.call('EXISTS', completedTrimKey) == 1
  failedTrimPending = redis.call('EXISTS', failedTrimKey) == 1
  if not completedTrimPending and not failedTrimPending then
    redis.call('DEL', nextTrimKey)
    return false
  end
  return true
end
`;

/** Adds a finished job in commit order and requests its numeric retention. */
function addFinishedJobLua(
  setKeyExpr: string,
  jobIdVar: string,
  immediateCleanupLimit = RETENTION_CLEANUP_BATCH_SIZE,
): string {
  return `
    local finishedSequence = redis.call('INCR', prefix .. ':finished-seq')
    redis.call('ZADD', ${setKeyExpr}, finishedSequence, ${jobIdVar})
    if removeMode > 0 then
      requestFinishedJobsTrim(prefix, ${setKeyExpr}, removeMode, ${immediateCleanupLimit})
    end`;
}

const addJobFunctionLua = `
local function jobSnapshot(prefix, jobId, disposition)
  local reply = {jobId, disposition}
  local fields = redis.call('HGETALL', prefix .. ':job:' .. jobId)
  for i = 1, #fields do
    reply[#reply + 1] = fields[i]
  end
  return reply
end

local function addJob(prefix, jobId, name, data, opts, now, delay, groupId, deduplicationId, deduplicationMode)
if jobId ~= '' then
  local requestedJobKey = prefix .. ':job:' .. jobId
  if redis.call('EXISTS', requestedJobKey) == 1 then
    if deduplicationId ~= '' then
      local existingDeduplicationId = redis.call('HGET', requestedJobKey, 'deduplicationId') or ''
      if existingDeduplicationId ~= '' and existingDeduplicationId ~= deduplicationId then
        return jobSnapshot(prefix, jobId, 'job-id-deduplication-conflict')
      end

      local deduplicationKey = prefix .. ':deduplication:' .. deduplicationId
      local mappedJobId = redis.call('GET', deduplicationKey)
      if mappedJobId and mappedJobId ~= jobId then
        if redis.call('EXISTS', prefix .. ':job:' .. mappedJobId) == 1 then
          return jobSnapshot(prefix, mappedJobId, 'deduplicated')
        end
        redis.call('DEL', deduplicationKey)
      end
      redis.call('HSET', requestedJobKey, 'deduplicationId', deduplicationId)
      redis.call('SET', deduplicationKey, jobId)
    end
    return jobSnapshot(prefix, jobId, 'existing-job-id')
  end
end
if deduplicationId ~= '' then
  local deduplicationKey = prefix .. ':deduplication:' .. deduplicationId
  local existingJobId = redis.call('GET', deduplicationKey)
  if existingJobId then
    local existingJobKey = prefix .. ':job:' .. existingJobId
    if redis.call('EXISTS', existingJobKey) == 1 then
      local shouldDeduplicate = deduplicationMode == 0
      if deduplicationMode > 0 then
        local existingGroupId = redis.call('HGET', existingJobKey, 'groupId') or ''
        local delayedMember = redis.call('HGET', existingJobKey, 'delayedMember')
        local priorityMember = redis.call('HGET', existingJobKey, 'priorityMember')
        shouldDeduplicate =
          redis.call('ZSCORE', prefix .. ':group-wait:' .. existingGroupId, existingJobId) or
          (priorityMember and redis.call('ZSCORE', prefix .. ':group-priority:' .. existingGroupId, priorityMember)) or
          (delayedMember and redis.call('ZSCORE', prefix .. ':delayed', delayedMember))
        if not shouldDeduplicate and deduplicationMode == 2 then
          shouldDeduplicate = redis.call('LPOS', prefix .. ':active', existingJobId)
        end
      end
      if shouldDeduplicate then
        return jobSnapshot(prefix, existingJobId, 'deduplicated')
      end
    end
    redis.call('DEL', deduplicationKey)
  end
end
if jobId == '' then
  jobId = tostring(redis.call('INCR', prefix .. ':id'))
end
local jobKey = prefix .. ':job:' .. jobId
if redis.call('EXISTS', jobKey) == 1 then
  return jobSnapshot(prefix, jobId, 'job-id-deduplication-conflict')
end
redis.call(
  'HSET', jobKey,
  'id', jobId,
  'name', name,
  'data', data,
  'opts', opts,
  'groupId', groupId,
  'deduplicationId', deduplicationId,
  'failedAttempts', '0',
  'stalledCount', '0'
)
if deduplicationId ~= '' then
  redis.call('SET', prefix .. ':deduplication:' .. deduplicationId, jobId)
end
if tonumber(delay) > 0 then
  ${addDelayedJobLua('jobKey', 'jobId', 'now + tonumber(delay)')}
else
  ${pushToGroupLua('groupId', 'jobId')}
  ${addMarkerLua}
end
return {jobId, 'created'}
end
`;

// ARGV: jobId ('' = auto-generate), name, data, opts, delay, groupId,
// deduplicationId, deduplicationMode (0 preserves any existing mapping, 1
// preserves waiting/delayed mappings, 2 also preserves active mappings). Returns
// the selected job id, its add disposition, and an atomic snapshot when an
// existing job was selected.
const addJobLua = `
local prefix = KEYS[1]
${redisTimeLua}
${addJobFunctionLua}
return addJob(prefix, ARGV[1], ARGV[2], ARGV[3], ARGV[4], now, ARGV[5], ARGV[6], ARGV[7], tonumber(ARGV[8]))
`;

// ARGV: job count, followed by seven serialized arguments for each standard
// deduplicated job. Returns one addJob reply per job.
const addBulkLua = `
local prefix = KEYS[1]
${redisTimeLua}
${addJobFunctionLua}
local replies = {}
local offset = 2
for i = 1, tonumber(ARGV[1]) do
  local jobId = ARGV[offset]
  local deduplicationId = ARGV[offset + 6]
  if jobId ~= '' and deduplicationId ~= '' then
    local existingDeduplicationId = redis.call(
      'HGET', prefix .. ':job:' .. jobId, 'deduplicationId'
    ) or ''
    if existingDeduplicationId ~= '' and existingDeduplicationId ~= deduplicationId then
      local conflict = jobSnapshot(prefix, jobId, 'job-id-deduplication-conflict')
      table.insert(conflict, 1, tostring(i))
      return conflict
    end
  end
  offset = offset + 7
end

offset = 2
for i = 1, tonumber(ARGV[1]) do
  replies[i] = addJob(
    prefix,
    ARGV[offset],
    ARGV[offset + 1],
    ARGV[offset + 2],
    ARGV[offset + 3],
    now,
    ARGV[offset + 4],
    ARGV[offset + 5],
    ARGV[offset + 6],
    0
  )
  offset = offset + 7
end
return replies
`;

// ARGV: jobId. Returns {state, field1, value1, ...}. Reading the state and job
// together gives polling callers a consistent snapshot of results and failures.
const getJobStatusLua = `
local prefix = KEYS[1]
local jobId = ARGV[1]
local jobKey = prefix .. ':job:' .. jobId
local state
local delayedMember = redis.call('HGET', jobKey, 'delayedMember')
if redis.call('LPOS', prefix .. ':active', jobId) then
  state = 'active'
elseif delayedMember and redis.call('ZSCORE', prefix .. ':delayed', delayedMember) then
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
local reply = {state}
local fields = redis.call('HGETALL', jobKey)
for i = 1, #fields do
  reply[#reply + 1] = fields[i]
end
return reply
`;

// ARGV: schedulerId, job name, data, opts, every, groupId. Preserves the
// next run when an identical scheduler is registered again by another process.
const upsertJobSchedulerLua = `
local prefix = KEYS[1]
${redisTimeLua}
local schedulerId = ARGV[1]
local schedulerKey = prefix .. ':scheduler:' .. schedulerId
local current = redis.call('HMGET', schedulerKey, 'name', 'data', 'opts', 'every', 'groupId')
local changed = current[1] ~= ARGV[2] or current[2] ~= ARGV[3] or current[3] ~= ARGV[4] or current[4] ~= ARGV[5] or current[5] ~= ARGV[6]
redis.call(
  'HSET', schedulerKey,
  'name', ARGV[2],
  'data', ARGV[3],
  'opts', ARGV[4],
  'every', ARGV[5],
  'groupId', ARGV[6]
)
local nextRun = redis.call('ZSCORE', prefix .. ':schedulers', schedulerId)
if not nextRun or changed then
  nextRun = now + tonumber(ARGV[5])
  redis.call('ZADD', prefix .. ':schedulers', nextRun, schedulerId)
end
${addMarkerLua}
return nextRun
`;

// ARGV: schedulerId. Removes both scheduler records atomically and returns the
// number of records removed.
const removeJobSchedulerLua = `
local prefix = KEYS[1]
local schedulerId = ARGV[1]
return redis.call('ZREM', prefix .. ':schedulers', schedulerId) +
  redis.call('DEL', prefix .. ':scheduler:' .. schedulerId)
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

const configureLimiterFunctionLua = `
local function configureLimiter(prefix, maximum, duration)
  local key = prefix .. ':limiter-config'
  local configured = redis.call('HMGET', key, 'max', 'duration')
  if configured[1] then
    return {tonumber(configured[1]), tonumber(configured[2])}
  end
  redis.call('HSET', key, 'max', maximum, 'duration', duration)
  return {maximum, duration}
end
`;

// ARGV: worker id, worker-session start time, fetch sequence, lock token,
// lock duration, expected group concurrency, maximum stalled count, mode
// ('claim' or 'reconcile'), optional queue-wide limiter max and duration.
// Promotes due delayed jobs, then hands out the next job round-robin across
// groups. Returns nil if there is nothing to do, {'delayed', delay} if the
// only remaining work is delayed, {'group-concurrency-mismatch', configured}
// if another worker configured a different limit, {'claim-lost'} when a
// previously returned job is no longer owned by this fetch, or
// {'job', field1, value1, ...} with the job's hash contents.
const moveToActiveLua = `
local prefix = KEYS[1]
${redisTimeLua}
${addJobFunctionLua}
${finishedJobsFunctionsLua}
${configureLimiterFunctionLua}
local workerId = ARGV[1]
local sessionStartedAt = tonumber(ARGV[2])
local fetchSequence = tonumber(ARGV[3])
local token = ARGV[4]
local lockDuration = tonumber(ARGV[5])
local limiterMax = tonumber(ARGV[9]) or 0
local limiterDuration = tonumber(ARGV[10]) or 0
local fetchKey = prefix .. ':fetch:' .. workerId
local fetchClaim = workerId .. ':' .. ARGV[3]

local function jobReply(jobKey)
  local reply = {'job'}
  local fields = redis.call('HGETALL', jobKey)
  for i = 1, #fields do
    reply[#reply + 1] = fields[i]
  end
  return reply
end

local function cacheFetch(result, value, stalledCount)
  redis.call(
    'HSET', fetchKey,
    'sessionStartedAt', sessionStartedAt,
    'sequence', fetchSequence,
    'token', token,
    'result', result
  )
  if value then
    redis.call('HSET', fetchKey, 'value', value)
  else
    redis.call('HDEL', fetchKey, 'value')
  end
  if stalledCount then
    redis.call('HSET', fetchKey, 'stalledCount', stalledCount)
  else
    redis.call('HDEL', fetchKey, 'stalledCount')
  end
  redis.call('PEXPIRE', fetchKey, ${FETCH_SESSION_TTL})
end

local cachedSequence = tonumber(redis.call('HGET', fetchKey, 'sequence'))
if not cachedSequence then
  if fetchSequence ~= 1 or sessionStartedAt > now or now - sessionStartedAt >= ${FETCH_SESSION_TTL} then
    return {'session-expired'}
  end
elseif tonumber(redis.call('HGET', fetchKey, 'sessionStartedAt')) ~= sessionStartedAt then
  return {'fetch-session-mismatch'}
elseif fetchSequence < cachedSequence then
  redis.call('PEXPIRE', fetchKey, ${FETCH_SESSION_TTL})
  return {'stale-fetch'}
elseif fetchSequence > cachedSequence + 1 then
  redis.call('PEXPIRE', fetchKey, ${FETCH_SESSION_TTL})
  return {'fetch-sequence-gap'}
elseif fetchSequence == cachedSequence then
  redis.call('PEXPIRE', fetchKey, ${FETCH_SESSION_TTL})
  if redis.call('HGET', fetchKey, 'token') ~= token then
    return {'fetch-token-mismatch'}
  end

  local cachedResult = redis.call('HGET', fetchKey, 'result')
  local cachedValue = redis.call('HGET', fetchKey, 'value')
  if cachedResult == 'empty' then
    return nil
  elseif cachedResult == 'cancelled' then
    return {'cancelled'}
  elseif cachedResult == 'delayed' then
    return {'delayed', math.max(tonumber(cachedValue) - now, 0)}
  elseif cachedResult == 'group-concurrency-mismatch' then
    return {'group-concurrency-mismatch', cachedValue}
  elseif cachedResult == 'claim-lost' then
    return {'claim-lost'}
  elseif cachedResult ~= 'job' or not cachedValue then
    return {'fetch-state-invalid'}
  end

  local claimedJobKey = prefix .. ':job:' .. cachedValue
  local claimedLockKey = prefix .. ':lock:' .. cachedValue
  local cachedStalledCount = redis.call('HGET', fetchKey, 'stalledCount')
  if redis.call('LPOS', prefix .. ':active', cachedValue) and redis.call('HGET', claimedJobKey, 'fetchClaim') == fetchClaim and redis.call('HGET', claimedJobKey, 'stalledCount') == cachedStalledCount then
    local claimedLock = redis.call('GET', claimedLockKey)
    if not claimedLock or claimedLock == token then
      redis.call('SET', claimedLockKey, token, 'PX', lockDuration)
      return jobReply(claimedJobKey)
    end
  end

  cacheFetch('claim-lost')
  return {'claim-lost'}
end

if ARGV[8] == 'reconcile' then
  cacheFetch('cancelled')
  return {'cancelled'}
end

local groupConcurrencyKey = prefix .. ':group-concurrency'
local configuredGroupConcurrency = redis.call('GET', groupConcurrencyKey)
if not configuredGroupConcurrency then
  configuredGroupConcurrency = ARGV[6]
  redis.call('SET', groupConcurrencyKey, configuredGroupConcurrency)
elseif tonumber(configuredGroupConcurrency) ~= tonumber(ARGV[6]) then
  cacheFetch('group-concurrency-mismatch', configuredGroupConcurrency)
  return {'group-concurrency-mismatch', configuredGroupConcurrency}
end

local configuredLimiter = configureLimiter(prefix, limiterMax, limiterDuration)
limiterMax = configuredLimiter[1]
limiterDuration = configuredLimiter[2]

if trimNextFinishedJobsBatch(prefix, ${RETENTION_CLEANUP_BATCH_SIZE}) then
  ${addMarkerLua}
end

if redis.call('EXISTS', prefix .. ':paused') == 1 then
  cacheFetch('empty')
  return nil
end
local delayedKey = prefix .. ':delayed'
local groupsKey = prefix .. ':groups'
local groupActiveKey = prefix .. ':group-active'

local dueSchedulers = redis.call('ZRANGEBYSCORE', prefix .. ':schedulers', '-inf', now, 'LIMIT', 0, 1000)
for i = 1, #dueSchedulers do
  local schedulerId = dueSchedulers[i]
  local dueAt = tonumber(redis.call('ZSCORE', prefix .. ':schedulers', schedulerId))
  local schedulerKey = prefix .. ':scheduler:' .. schedulerId
  local scheduler = redis.call('HMGET', schedulerKey, 'name', 'data', 'opts', 'every', 'groupId')
  local every = tonumber(scheduler[4])
  if dueAt and scheduler[1] and scheduler[2] and scheduler[3] and every and every > 0 and scheduler[5] then
    local intervalsMissed = math.floor((now - dueAt) / every) + 1
    redis.call('ZADD', prefix .. ':schedulers', dueAt + intervalsMissed * every, schedulerId)
    addJob(prefix, '', scheduler[1], scheduler[2], scheduler[3], now, 0, scheduler[5], '', 0)
  else
    redis.call('ZREM', prefix .. ':schedulers', schedulerId)
    redis.call('DEL', schedulerKey)
  end
end

local due = redis.call('ZRANGEBYSCORE', delayedKey, '-inf', now, 'LIMIT', 0, 1000)
for i = 1, #due do
  local dueMember = due[i]
  local dueJobId = string.sub(dueMember, ${DELAYED_SEQUENCE_WIDTH + 2})
  local dueJobKey = prefix .. ':job:' .. dueJobId
  redis.call('ZREM', delayedKey, dueMember)
  redis.call('HDEL', dueJobKey, 'delayedMember')
  local dueGroupId = redis.call('HGET', dueJobKey, 'groupId')
  if dueGroupId then
    ${pushToGroupLua('dueGroupId', 'dueJobId')}
  end
end

local limiterKey = prefix .. ':limiter'
if limiterMax > 0 and tonumber(redis.call('GET', limiterKey) or '0') >= limiterMax then
  local remaining = redis.call('PTTL', limiterKey)
  if remaining > 0 then
    cacheFetch('delayed', tostring(now + remaining))
    return {'delayed', remaining}
  end
end

local limit = tonumber(configuredGroupConcurrency)
local groupCount = redis.call('LLEN', groupsKey)
for i = 1, groupCount do
  local groupId = redis.call('LMOVE', groupsKey, groupsKey, 'LEFT', 'RIGHT')
  if not groupId then break end
  local activeCount = tonumber(redis.call('HGET', groupActiveKey, groupId) or '0')
  if limit == 0 or activeCount < limit then
    local popped = redis.call('ZPOPMIN', prefix .. ':group-wait:' .. groupId)
    local jobId = popped[1]
    if not jobId then
      local prioritized = redis.call('ZPOPMIN', prefix .. ':group-priority:' .. groupId)
      if #prioritized > 0 then
        jobId = string.sub(prioritized[1], ${PRIORITY_SEQUENCE_WIDTH + 2})
        redis.call('HDEL', prefix .. ':job:' .. jobId, 'priorityMember')
      end
    end
    if jobId then
      local jobKey = prefix .. ':job:' .. jobId
      if limiterMax > 0 then
        if redis.call('INCR', limiterKey) == 1 then
          redis.call('PEXPIRE', limiterKey, limiterDuration)
        end
      end
      redis.call('HINCRBY', groupActiveKey, groupId, 1)
      redis.call('RPUSH', prefix .. ':active', jobId)
      redis.call(
        'HSET', jobKey,
        'fetchClaim', fetchClaim,
        'claimMaxStalledCount', ARGV[7]
      )
      redis.call('SET', prefix .. ':lock:' .. jobId, token, 'PX', lockDuration)
      cacheFetch('job', jobId, redis.call('HGET', jobKey, 'stalledCount'))
      return jobReply(jobKey)
    elseif activeCount == 0 then
      redis.call('LREM', groupsKey, -1, groupId)
      redis.call('SREM', prefix .. ':group-members', groupId)
      redis.call('HDEL', groupActiveKey, groupId)
    end
  end
end

local nextTimestamp = nil
local nextDelayed = redis.call('ZRANGE', delayedKey, 0, 0, 'WITHSCORES')
if #nextDelayed > 0 then
  nextTimestamp = tonumber(nextDelayed[2])
end
local nextScheduler = redis.call('ZRANGE', prefix .. ':schedulers', 0, 0, 'WITHSCORES')
if #nextScheduler > 0 and (not nextTimestamp or tonumber(nextScheduler[2]) < nextTimestamp) then
  nextTimestamp = tonumber(nextScheduler[2])
end
if nextTimestamp then
  local nextTimestampString = tostring(nextTimestamp)
  cacheFetch('delayed', nextTimestampString)
  return {'delayed', math.max(nextTimestamp - now, 0)}
end
cacheFetch('empty')
return nil
`;

// ARGV: jobId, lock token, returnvalue, removeMode (0 = keep all, -1 = remove
// immediately, N > 0 = keep the N most recent).
// Returns 0 on success, -1 if the lock was lost.
const moveToCompletedLua = `
local prefix = KEYS[1]
${finishedJobsFunctionsLua}
local jobId = ARGV[1]
local jobKey = prefix .. ':job:' .. jobId
local lockKey = prefix .. ':lock:' .. jobId
if redis.call('GET', lockKey) ~= ARGV[2] then
  return -1
end
redis.call('DEL', lockKey)
redis.call('LREM', prefix .. ':active', 1, jobId)
redis.call('HDEL', jobKey, 'fetchClaim', 'claimMaxStalledCount')
local groupId = redis.call('HGET', jobKey, 'groupId') or ''
redis.call('HINCRBY', prefix .. ':group-active', groupId, -1)
if ${groupWaitingCountLua('groupId')} > 0 then
  ${addMarkerLua}
end
${cleanupGroupLua('groupId')}
local removeMode = tonumber(ARGV[4])
if removeMode == -1 then
  ${deleteJobLua('jobKey', 'jobId')}
else
  redis.call('HSET', jobKey, 'returnvalue', ARGV[3])
  ${addFinishedJobLua("prefix .. ':completed'", 'jobId')}
end
return 0
`;

// ARGV: jobId, lock token, willRetry ('1'/'0'), retryDelay, removeMode.
// Returns 1 if the job was requeued for a retry, 0 if it was moved to
// failed, or -1 if the lock was lost.
const moveToFailedLua = `
local prefix = KEYS[1]
${redisTimeLua}
${finishedJobsFunctionsLua}
local jobId = ARGV[1]
local jobKey = prefix .. ':job:' .. jobId
local lockKey = prefix .. ':lock:' .. jobId
if redis.call('GET', lockKey) ~= ARGV[2] then
  return -1
end
redis.call('DEL', lockKey)
redis.call('LREM', prefix .. ':active', 1, jobId)
redis.call('HDEL', jobKey, 'fetchClaim', 'claimMaxStalledCount')
local groupId = redis.call('HGET', jobKey, 'groupId') or ''
redis.call('HINCRBY', prefix .. ':group-active', groupId, -1)
if ${groupWaitingCountLua('groupId')} > 0 then
  ${addMarkerLua}
end
redis.call('HINCRBY', jobKey, 'failedAttempts', 1)
local requeued = 0
if ARGV[3] == '1' then
  requeued = 1
  if tonumber(ARGV[4]) > 0 then
    ${addDelayedJobLua('jobKey', 'jobId', 'now + tonumber(ARGV[4])')}
  else
    ${pushToGroupLua('groupId', 'jobId')}
    ${addMarkerLua}
  end
else
  local removeMode = tonumber(ARGV[5])
  if removeMode == -1 then
    ${deleteJobLua('jobKey', 'jobId')}
  else
    ${addFinishedJobLua("prefix .. ':failed'", 'jobId')}
  end
end
${cleanupGroupLua('groupId')}
return requeued
`;

// ARGV: worker id, lock duration, followed by job id and lock token pairs.
// Returns the ids of jobs whose locks were already lost.
const extendLocksLua = `
local prefix = KEYS[1]
redis.call('PEXPIRE', prefix .. ':fetch:' .. ARGV[1], ${FETCH_SESSION_TTL})
local lost = {}
for i = 3, #ARGV, 2 do
  local jobId = ARGV[i]
  local lockKey = prefix .. ':lock:' .. jobId
  if redis.call('GET', lockKey) == ARGV[i + 1] then
    redis.call('PEXPIRE', lockKey, ARGV[2])
  else
    lost[#lost + 1] = jobId
  end
end
return lost
`;

// ARGV: current time in milliseconds, stalled-check interval in milliseconds.
//
// Only the worker that acquires the queue-wide, expiring lease scans active
// jobs. Each job uses the limit recorded by the worker that claimed it. Jobs
// with expired locks are requeued until they exceed that limit, then moved to
// failed. Returns {requeuedJobIds, failedJobIds}. If another worker holds the
// lease, returns two empty lists without scanning. Claims without a recorded
// limit use the default of 1.
const checkStalledLua = `
local prefix = KEYS[1]
${finishedJobsFunctionsLua}
if not redis.call('SET', prefix .. ':stalled-check', ARGV[1], 'PX', ARGV[2], 'NX') then
  return {{}, {}}
end
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
      local maxStalledCount = tonumber(
        redis.call('HGET', jobKey, 'claimMaxStalledCount') or '1'
      )
      redis.call('HDEL', jobKey, 'fetchClaim', 'claimMaxStalledCount')
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
          ${deleteJobLua('jobKey', 'jobId')}
        else
          ${addFinishedJobLua("prefix .. ':failed'", 'jobId', 0)}
        end
        failed[#failed + 1] = jobId
      else
        ${pushToGroupLua('groupId', 'jobId')}
        requeued[#requeued + 1] = jobId
      end
      ${cleanupGroupLua('groupId')}
    end
  end
end
if #requeued > 0 then
  ${addMarkerLua}
end
if trimNextFinishedJobsBatch(prefix, ${RETENTION_CLEANUP_BATCH_SIZE}) then
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
  waiting = waiting + ${groupWaitingCountLua('groups[i]')}
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
  reply[#reply + 1] = tostring(${groupWaitingCountLua('groupId')})
  reply[#reply + 1] = redis.call('HGET', prefix .. ':group-active', groupId) or '0'
end
return reply
`;

interface PrairieMQCommands {
  pmqAddJob(
    prefix: string,
    jobId: string,
    name: string,
    data: string,
    opts: string,
    delay: number,
    groupId: string,
    deduplicationId: string,
    deduplicationMode: number,
  ): Promise<[string, string, ...string[]]>;
  pmqAddBulk(
    prefix: string,
    jobCount: number,
    ...jobs: (string | number)[]
  ): Promise<[string, string, ...string[]][] | [string, string, string, ...string[]]>;
  pmqGetJobStatus(prefix: string, jobId: string): Promise<string[]>;
  pmqUpsertJobScheduler(
    prefix: string,
    schedulerId: string,
    name: string,
    data: string,
    opts: string,
    every: number,
    groupId: string,
  ): Promise<number>;
  pmqRemoveJobScheduler(prefix: string, schedulerId: string): Promise<number>;
  pmqConfigureGroupConcurrency(prefix: string, groupConcurrency: number): Promise<number>;
  pmqMoveToActive(
    prefix: string,
    workerId: string,
    sessionStartedAt: number,
    fetchSequence: number,
    token: string,
    lockDuration: number,
    groupConcurrency: number,
    maxStalledCount: number,
    mode: 'claim' | 'reconcile',
    limiterMax?: number,
    limiterDuration?: number,
  ): Promise<string[] | null>;
  pmqMoveToCompleted(
    prefix: string,
    jobId: string,
    token: string,
    returnvalue: string,
    removeMode: number,
  ): Promise<number>;
  pmqMoveToFailed(
    prefix: string,
    jobId: string,
    token: string,
    willRetry: number,
    retryDelay: number,
    removeMode: number,
  ): Promise<number>;
  pmqExtendLocks(
    prefix: string,
    workerId: string,
    duration: number,
    ...locks: string[]
  ): Promise<string[]>;
  pmqCheckStalled(
    prefix: string,
    now: number,
    stalledInterval: number,
  ): Promise<[string[], string[]]>;
  pmqGetCounts(prefix: string): Promise<[number, number, number, number, number]>;
  pmqGetGroups(prefix: string): Promise<string[]>;
}

export type PrairieMQRedis = Redis &
  PrairieMQCommands & {
    ensureMinimumRedisVersion(): Promise<void>;
  };

const scripts: Record<keyof PrairieMQCommands, string> = {
  pmqAddJob: addJobLua,
  pmqAddBulk: addBulkLua,
  pmqGetJobStatus: getJobStatusLua,
  pmqUpsertJobScheduler: upsertJobSchedulerLua,
  pmqRemoveJobScheduler: removeJobSchedulerLua,
  pmqConfigureGroupConcurrency: configureGroupConcurrencyLua,
  pmqMoveToActive: moveToActiveLua,
  pmqMoveToCompleted: moveToCompletedLua,
  pmqMoveToFailed: moveToFailedLua,
  pmqExtendLocks: extendLocksLua,
  pmqCheckStalled: checkStalledLua,
  pmqGetCounts: getCountsLua,
  pmqGetGroups: getGroupsLua,
};

export function createScriptedClient({
  redisUrl,
  role,
}: {
  redisUrl: string;
  role: 'queue' | 'worker';
}): PrairieMQRedis {
  const client = new Redis<'legacy'>(redisUrl, {
    // Every mutating script has an ambiguous outcome if its reply is lost.
    // Callers may retry with a stable job ID; the client must never replay a
    // command that can allocate a fresh ID or advance queue state.
    autoResendUnfulfilledCommands: false,
    commandTimeout: REDIS_COMMAND_TIMEOUT,
    // Command timeouts reject callers but leave commands queued for replies.
    // Close stalled sockets so those commands and their payloads are released.
    socketTimeout: REDIS_COMMAND_TIMEOUT,
    enableOfflineQueue: false,
    maxRetriesPerRequest: role === 'worker' ? 0 : 1,
  });
  for (const [name, lua] of Object.entries(scripts)) {
    client.defineCommand(name, { numberOfKeys: 1, lua });
  }
  const scriptedClient = client as PrairieMQRedis;
  let connectionGeneration = 0;
  let verifiedGeneration = -1;
  let versionCheck: { generation: number; promise: Promise<void> } | null = null;
  client.on('close', () => {
    connectionGeneration += 1;
    versionCheck = null;
  });
  scriptedClient.ensureMinimumRedisVersion = async () => {
    while (true) {
      const generation = connectionGeneration;
      if (verifiedGeneration === generation) return;
      if (versionCheck?.generation !== generation) {
        versionCheck = {
          generation,
          promise: waitForRedisReady(client)
            .then(() => ensureSelectedDatabase(client))
            .then(() => assertMinimumRedisVersion(client)),
        };
      }
      const check = versionCheck;
      try {
        await check.promise;
        if (connectionGeneration !== generation) continue;
        verifiedGeneration = generation;
        return;
      } finally {
        if (versionCheck === check) versionCheck = null;
      }
    }
  };
  return scriptedClient;
}
