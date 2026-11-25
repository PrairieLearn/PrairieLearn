---
'@prairielearn/prairiemq': minor
---

Add ElastiCache Serverless Valkey connection support, including Serverless version metadata. Reject unsafe `ASK` redirects during slot migration. Queue keys, stored records, and native Redis expiration remain unchanged, allowing old and new clients to run together during a rolling upgrade.
