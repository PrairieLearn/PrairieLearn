# Course agent

A Cloudflare Worker backend that coordinates PrairieLearn course agent conversations, running Codex sessions in Cloudflare Sandboxes to create and modify course content.

## Local usage

Start with a working [native PrairieLearn development setup](../../docs/dev-guide/installingNative.md) and Docker running. Run the following commands from the repository root.

Copy the secrets template:

```sh
cp apps/course-agent/.dev.vars.example apps/course-agent/.dev.vars
```

Set `OPENAI_API_KEY` and `PL_SERVICE_TOKEN` in `apps/course-agent/.dev.vars`. Generate a service token with:

```sh
openssl rand -hex 32
```

Add the following to `apps/prairielearn/config.json`, replacing `PL_SERVICE_TOKEN` with the same service token:

```json
{
  "isEnterprise": true,
  "courseAgentServiceUrl": "http://127.0.0.1:8790",
  "courseAgentServiceToken": "PL_SERVICE_TOKEN",
  "features": {
    "course-agent": true
  }
}
```

Start the Worker:

```sh
pnpm --filter @prairielearn/course-agent dev
```

In another terminal, start PrairieLearn:

```sh
make dev
```

### Testing the course agent

You can test the course agent in a course if:

- It is not an example course.
- It has the `course-agent` feature enabled.
- Both the effective and authenticated user have Owner permissions.

Navigate to the course, then click the Course Agent button in the bottom right corner.

With `fileEditorUseGit: false`, approved changes are saved locally without committing to Git. To commit and push approved changes, set `fileEditorUseGit: true` in `apps/prairielearn/config.json`, configure the course repository and branch, and configure PrairieLearn’s Git credentials with write access. Set `GITHUB_READ_TOKEN` in `apps/course-agent/.dev.vars` to a token with read access to that repository so the agent can clone and fetch it.

## Review limits

Each review supports at most 100 changed files, with a 1 MiB limit on each original or proposed file and a 20 MiB aggregate limit counting base64-encoded original and proposed contents. Binary files such as images are supported. Executable files, symlinks, and file-mode changes are unsupported and cause the review to fail.

## Upgrading Codex

Update the release version and the asset's SHA-256 digest (shown on the GitHub release) in `container/Dockerfile`. Then update the feature flags in `container/codex-config.toml` to match the new release.

## Attachment retention

Attachments and their thumbnails are stored in the checkpoint bucket under `uploads/`. A bucket lifecycle rule deletes them 30 days after upload, whether or not the conversation is still in use, and R2 removes an expired object within about a day. The conversation keeps the message, but a sandbox started after that no longer has the file.

The Worker does not create the rule. PrairieLearn's deployed environments define it in Terraform alongside the bucket, so a bucket created any other way keeps attachments until it is given one.

Only the uploaded files expire. A sandbox checkpoint holds the agent's workspace and thread history, so anything the agent copied or printed from an attachment lasts as long as the checkpoint.

## Deployment environments and monitoring

Use `pnpm --filter @prairielearn/course-agent deploy --env staging` or `--env production`. Set `CLOUDFLARE_ACCOUNT_ID` to the target Cloudflare account when deploying. The top-level configuration is for local development. Each named environment has its own Worker, Durable Object bindings/storage, checkpoint bucket, model/deadline vars, and secrets. Resource bindings and container configuration are repeated explicitly because Wrangler does not inherit them into named environments.

Create the matching checkpoint bucket and configure `PL_SERVICE_TOKEN`, `OPENAI_API_KEY`, and (for GitHub course sources) `GITHUB_READ_TOKEN` separately for each deployed environment. Configure PL to use the matching Worker URL and service token. Do not point staging at production conversation storage or checkpoints. No deployment or resource provisioning is performed by local checks.

Every object in the checkpoint bucket lives under a prefix that names its kind, so R2 lifecycle rules can be scoped by prefix: sandbox checkpoints under `checkpoints/` (`<id>.tar.zst`, referenced by conversation state and deleted by the archive cleanup, so they must never expire by age) and local course archives under `local-sources/`. A checkpoint record stores only its id, so changing the checkpoint prefix makes existing checkpoints unreachable unless their objects are copied to the new prefix first.

Set that environment's `SENTRY_DSN` secret (`wrangler secret put SENTRY_DSN --env <environment>`) to enable error reporting; the DSN is kept out of this public repository. `SENTRY_ENVIRONMENT` and Worker version metadata identify the deployment. Reports cover Worker handlers, Durable Object/RPC operations, and handled background lifecycle failures. Reports include request URLs without query parameters and headers, including course context, with Sentry's default sensitive-header filtering. Request bodies, cookies, IP addresses, and breadcrumbs are not attached. Model and service credentials are redacted from exception messages. Local development does not report to Sentry.

Workers Logs is enabled for every environment, including Durable Object-managed container logs. Only console output is kept: invocation logs are disabled because Cloudflare does not document whether they redact request headers, and PrairieLearn sends the service token in `Authorization`. Console output covers reported errors and one structured line per milestone, each with a readable `message` (event, key fields, and elapsed ms) plus the same fields as JSON, with service credentials redacted. Turn lines (`turn_*`, timed from when the message arrived) cover start, sandbox prepare, course files started/ready and runner connected (which overlap), the workspace being ready, first reply delta, and finish. The sandbox prepare line includes the instance type; the runner logs its start and readiness, and the model proxy logs the first model request of each turn and when its response starts. Transitions to blocked states such as `startup_failed` are logged too. A runner that exits or never listens fails startup with its exit code, elapsed time, and container state. Nothing logs chat messages, prompts, model responses, or course file contents; command failures can include file paths and repository names.

Deploys defer Durable Object code updates for up to seven hours, so turns that are running at deploy time normally continue on the old code. Deferral is best effort: Cloudflare runtime updates and other platform restarts can still interrupt a turn earlier. A conversation that keeps starting new turns on the old code is still reset at seven hours, which interrupts any turn in progress. For an urgent fix, deploy with `--durable-objects-code-update-mode immediate`, which interrupts active turns.

### Rotating the service token

PrairieLearn sends the first token listed in `courseAgentServiceToken`. The Worker accepts `PL_SERVICE_TOKEN` and the optional `PL_SERVICE_TOKEN_PREVIOUS` secret. Rotate without downtime in this order, running the Worker commands from `apps/course-agent` for each deployed environment:

1. Set PrairieLearn's `courseAgentServiceToken` to `["OLD_TOKEN", "NEW_TOKEN"]` and deploy PrairieLearn.
2. Run `wrangler secret put PL_SERVICE_TOKEN_PREVIOUS --env <environment>` with the old token, then `wrangler secret put PL_SERVICE_TOKEN --env <environment>` with the new token. Each command deploys immediately, so keep this order to avoid rejecting PrairieLearn's old token.
3. Set PrairieLearn's `courseAgentServiceToken` to `["NEW_TOKEN"]` and deploy PrairieLearn.
4. Delete the old token with `wrangler secret delete PL_SERVICE_TOKEN_PREVIOUS --env <environment>`.
