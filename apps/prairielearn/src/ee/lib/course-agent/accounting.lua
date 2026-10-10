-- All of a user's capacity, escrows and charges live in one hash field. Two
-- webservers admitting parallel requests must see each other's reservations.
-- No deadline alone releases capacity or refunds a request of unknown outcome.
local epoch = redis.call('HGET', KEYS[1], 'epoch')
if epoch ~= ARGV[1] then return cjson.encode({error='accounting_unavailable'}) end
-- A failover can lose acknowledged writes while retaining the epoch sentinel.
-- A changed Redis process identity closes the gate until an operator reconciles
-- outstanding CF evidence and explicitly reopens this accounting generation.
local server = redis.call('INFO', 'server')
local runId = string.match(server, 'run_id:(%x+)')
if not runId or redis.call('HGET', KEYS[1], 'server_run_id') ~= runId then return cjson.encode({error='accounting_unavailable'}) end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local hour = tostring(math.floor(now / 3600000))
local field = 'user:' .. ARGV[2]
local stored = redis.call('HGET', KEYS[1], field)
local state = stored and cjson.decode(stored) or {actions={},requests={},hours={}}
local command = cjson.decode(ARGV[3])
local policy = cjson.decode(ARGV[4])
local referenced = {}
local chargeHours = {}
local retained = 0
for id, r in pairs(state.requests) do
  if r.status ~= 'reserved' and now-r.createdAt > 7*86400000 then state.requests[id]=nil
  else
    referenced[r.actionId]=true; retained=retained+1
    if r.hour then chargeHours[r.hour]=true end
  end
end
for h in pairs(state.hours) do
  if tonumber(h) < tonumber(hour)-7*24 and not chargeHours[h] then state.hours[h]=nil end
end
local actions = 0
for id, a in pairs(state.actions) do
  if not a.active and not referenced[id] and now-a.grant.expiresAt > 86400000 then state.actions[id]=nil
  else actions=actions+1 end
end
local function fail(code) return cjson.encode({error=code}) end
local function save(value)
  redis.call('HSET', KEYS[1], field, cjson.encode(state))
  return cjson.encode({value=value})
end
-- First-time commands have a short admission window. Expired identities cannot
-- be resurrected after receipt retention; retries of retained identities work.
local function fresh(at) return at and math.abs(now-at) <= 120000 end
local function outstanding()
  local sum = 0
  for _, r in pairs(state.requests) do
    if r.status == 'reserved' then sum = sum + r.maximum end
  end
  return sum
end
if state.blocked and (command.kind == 'authorize' or command.kind == 'reserve') then return fail('accounting_unavailable') end
if command.kind == 'authorize' then
  local a = state.actions[command.actionId]
  if a and a.binding ~= command.binding then return fail('identity_conflict') end
  if not a and not fresh(command.createdAt) then return fail('admission_expired') end
  if not a and actions >= 1500 then return fail('receipt_retention_limit') end
  if a and now >= a.grant.expiresAt then return fail('turn_limit') end
  local active = 0
  for id, item in pairs(state.actions) do
    if item.active then
      if item.conversation == command.conversation and id ~= command.actionId then
        return fail('conversation_busy')
      end
      if id ~= command.actionId then active = active + 1 end
    end
  end
  if active >= policy.concurrency then return fail('capacity_limit') end
  if (state.hours[hour] or 0) + outstanding() >= policy.hourly then return fail('hourly_limit') end
  if not a then
    a = {binding=command.binding,conversation=command.conversation,cost=0,count=0,
      grant={id=command.actionId,actionId=command.actionId,expiresAt=now+policy.runtime,
        maxToolCalls=policy.tools,maxRuntimeMs=policy.runtime,maxModelRequests=policy.requests}}
    state.actions[command.actionId] = a
  end
  if a.cost >= policy.turn then return fail('turn_limit') end
  if not a.active then a.grant.id = command.commandId end
  a.active = true
  return save(a.grant)
elseif command.kind == 'release' then
  local a = state.actions[command.actionId]
  if not a then return save(true) end
  if a.binding ~= command.binding then return fail('identity_conflict') end
  if a.grant.id ~= command.grantId then return save(true) end
  a.active = false
  return save(true)
elseif command.kind == 'reserve' then
  local old = state.requests[command.modelRequestId]
  if old then
    if old.digest ~= command.digest or old.binding ~= command.binding then return fail('identity_conflict') end
    return save(old.grant)
  end
  if retained >= 1500 then return fail('receipt_retention_limit') end
  if not fresh(command.createdAt) then return fail('admission_expired') end
  local a = state.actions[command.actionId]
  if not a or not a.active or a.binding ~= command.binding or a.grant.id ~= command.capacityGrantId then return fail('capacity_required') end
  if now >= a.grant.expiresAt or a.count >= policy.requests then return fail('turn_limit') end
  local available = math.min(policy.request,policy.turn-a.cost,policy.hourly-(state.hours[hour] or 0)-outstanding())
  local input = math.ceil(command.inputTokenUpperBound * command.inputPrice)
  local output = math.min(command.requestedMaxOutputTokens,math.floor((available-input)/command.outputPrice))
  if output < 16 then return fail('budget_limit') end
  local maximum = input + math.ceil(output*command.outputPrice)
  local grant = {reservationId=command.modelRequestId,reservedCostUnits=maximum,maxOutputTokens=output,expiresAt=math.min(a.grant.expiresAt,now+120000)}
  state.requests[command.modelRequestId] = {binding=command.binding,digest=command.digest,actionId=command.actionId,
    maximum=maximum,status='reserved',createdAt=now,prices=command.prices,grant=grant}
  a.cost = a.cost + maximum
  a.count = a.count + 1
  return save(grant)
elseif command.kind == 'lookup' then
  local r = state.requests[command.modelRequestId]
  if r and (r.binding ~= command.binding or r.digest ~= command.digest) then return fail('identity_conflict') end
  return cjson.encode({value=r and r.grant or cjson.null})
elseif command.kind == 'settle' then
  local r = state.requests[command.reservationId]
  if not r or r.binding ~= command.binding then return fail('identity_conflict') end
  local actual = r.maximum
  local status = 'unknown'
  if command.settlement == 'not_sent' then actual=0; status='not_sent'
  elseif command.settlement == 'measured' then
    local u = command.usage
    actual = math.ceil((u.input-u.cached-u.cacheWrite)*r.prices.input + u.cached*r.prices.cachedInput + u.cacheWrite*r.prices.cacheWrite + u.output*r.prices.output)
    status='measured'
    if actual > r.maximum then
      state.blocked = true
      save(false)
      return fail('usage_exceeds_reservation')
    end
  end
  if r.status ~= 'reserved' then
    if r.status == 'unknown' and status == 'measured' then
      -- Correction belongs to the hour of the unknown charge, never today's hour.
      state.hours[r.hour] = (state.hours[r.hour] or 0) + actual-r.maximum
      state.actions[r.actionId].cost = state.actions[r.actionId].cost + actual-r.maximum
      r.status='measured'; r.actual=actual; r.responseId=command.responseId; r.usage=command.usage
      return save(true)
    end
    if r.status ~= status or (status == 'measured' and (
      r.actual ~= actual or r.responseId ~= command.responseId or
      r.usage.input ~= command.usage.input or r.usage.cached ~= command.usage.cached or
      r.usage.cacheWrite ~= command.usage.cacheWrite or r.usage.output ~= command.usage.output
    )) then return fail('settlement_conflict') end
    return save(true)
  end
  r.status=status; r.actual=actual; r.hour=hour; r.responseId=command.responseId; r.usage=command.usage
  state.hours[hour] = (state.hours[hour] or 0) + actual
  state.actions[r.actionId].cost = state.actions[r.actionId].cost + actual-r.maximum
  return save(true)
elseif command.kind == 'status' then
  return cjson.encode({value=state})
end
return fail('invalid_command')
