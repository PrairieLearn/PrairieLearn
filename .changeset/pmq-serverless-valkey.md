---
'@prairielearn/prairiemq': minor
---

Add Redis Cluster and ElastiCache Serverless Valkey connection support, including Serverless version metadata and connection recovery. Queue key names, stored records, and native Redis expiration remain unchanged, allowing old and new clients to run together during a rolling upgrade.
