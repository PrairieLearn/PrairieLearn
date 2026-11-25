---
'@prairielearn/prairiemq': minor
---

Support Redis Cluster and ElastiCache Serverless Valkey, including Serverless version metadata and connection recovery. Existing queues keep their storage format by default and can be upgraded with old and new clients running together.

New queues can opt into `persistentMetadata` to store worker ownership, fetch replay protection, and rate-limit deadlines without key expiration, protecting them from volatile eviction policies. Every producer and worker for that queue must use the same setting. Enabling persistent metadata on an existing queue is a separate storage migration, not part of a normal library upgrade.
