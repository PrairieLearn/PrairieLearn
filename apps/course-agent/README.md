# Course agent Worker

Run a standalone durable Codex conversation using Cloudflare Sandboxes. The Chat Durable Object owns history, execution, steering, generic pending calls, checkpoint/restore, and cleanup. Trusted outbound handlers restrict Git access to the configured repository and inject model credentials outside the sandbox.

## Try the deterministic runtime

```sh
pnpm install
pnpm --filter @prairielearn/course-agent-contract build
pnpm --filter @prairielearn/course-agent dev:fixture
```

In another terminal, run `pnpm --filter @prairielearn/course-agent demo -- "Please inspect the course."`. This authenticated client configures a unique conversation, submits a message, waits for completion, and prints its durable transcript. It defaults to the fixture at port 8791 and uses the public fixture credential. Override `COURSE_AGENT_URL` and `COURSE_AGENT_SERVICE_TOKEN` for a real local Worker.

The real Worker uses port 8790: copy `.dev.vars.example` to `.dev.vars`, configure the service token, model and model key, and shared GitHub client token, start Docker, and run `pnpm --filter @prairielearn/course-agent dev`. Pass `COURSE_AGENT_REPOSITORY=owner/repo` and `COURSE_AGENT_BRANCH=main` to the demo client. Use a disposable course repository. Publication is not enabled in this stage.

## Verify recovery

With the fixture running, `pnpm --filter @prairielearn/course-agent test:lifecycle` exercises the real Chat DO in workerd: steering reconciliation, ten-minute idle checkpoint/restore, one latest checkpoint, bounded cleanup retries, receipt compaction and generic cold-result delivery. `pnpm --filter @prairielearn/course-agent test` also checks protocol mapping, immutable capture and outbound restrictions.

Snapshots and browser disconnects never restart execution or reset idle expiration. Missing checkpoints produce a visible error instead of silently creating a new session. Cleanup must be confirmed before starting a replacement sandbox.

## Deployment

The checked-in Wrangler configuration is for local development. Cloudflare/R2 provisioning and deployed backup/restore verification belong to a separate rollout. No production service is provisioned by this change.

## PrairieLearn instructor chat

Start the fixture and the normal PL development server. In local `config.json`, set `isEnterprise: true`, `redisUrl: "redis://localhost:6379"`, `features: { "course-agent": true }`, and `courseAgent: { "workerUrl": "http://localhost:8791", "serviceToken": "local-fixture-service-token-not-a-secret", "pricing": { "fixture-model": { "input": 0, "cachedInput": 0, "output": 0 } } }`. Use a non-example course where both your authenticated and effective users are owners, with repository `https://github.com/example/course.git` and branch `main`.

Open the course-agent rail, send a message, steer it, navigate to Questions while it runs, and reload. The conversation and unsent draft remain available. Statistics show native usage, estimated model cost, and sandbox expiration. Missing usage/cost remains unknown; exact model pricing is required before new work. Defaults permit two active conversations per user, five per course, 30 requests per user per hour, and $20 in known estimates per day. Unknown completed cost blocks new admissions.

With the fixture running, execute `COURSE_AGENT_FIXTURE_URL=http://localhost:8791 pnpm --filter @prairielearn/prairielearn test:e2e courseAgent.spec.ts --workers=1` for the real browser flow. This stage does not offer publication.
