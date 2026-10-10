-- Concurrent first-time provisioning converges; no existing state is reset.
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'epoch', ARGV[1], 'server_run_id', ARGV[2])
return 1
