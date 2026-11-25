---
'@prairielearn/prairiemq': major
---

Support Redis Cluster and ElastiCache Serverless Valkey, including Serverless version metadata and connection recovery. Store worker ownership, fetch replay protection, and rate-limit deadlines without key expiration so volatile eviction policies cannot remove them early.

The queue storage format has changed. Stop all old queue producers and workers and let active jobs finish before upgrading; rolling upgrades with old and new clients on the same queue are not supported. Waiting jobs and recurring schedules retain their existing keys.
