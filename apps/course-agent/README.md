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

## Sandbox image

The sandbox image (`container/Dockerfile`) is Debian slim with Codex's app server and a few CLI tools. It has no Node.js, so the agent can't run `node`, `npm`, or `npx`. Each sandbox installs the Codex config from `container/codex-config.toml` into its workspace, and installs it again after restoring a checkpoint.

`SANDBOX_INSTANCE_TYPE` selects the Cloudflare instance type for each environment. It defaults to `standard-2` because cloning large courses is CPU-bound.

To upgrade Codex, update the release version and the asset's SHA-256 digest (shown on the GitHub release) in the Dockerfile. Then update the feature flags in `container/codex-config.toml` to match the new release.

## Web access

The agent can search the web and read pages through Codex's `web.run` tool, for example to check PrairieLearn documentation or an institution's academic calendar. Codex sends these commands to the model endpoint, and the Worker forwards them to OpenAI, which performs the searches and page reads. The container itself has no internet access. The Worker forwards only the commands it recognizes, sets the search settings itself, and refuses OpenAI-hosted tools in model requests, because the agent can send requests to the model endpoint directly. Searches and page addresses leave PrairieLearn, and page content is untrusted: a page could ask the agent to put course content in a URL it opens.

## Attachments

Staff can attach up to 10 files of at most 20 MB each to a message. The browser uploads each one through PrairieLearn when the message is sent, and the Worker stores it in the checkpoint bucket under `uploads/<conversation>/<upload>`. The agent sees attached images and can read every attachment from `/workspace/uploads`; see [CONTRACT.md](CONTRACT.md#attachments). Attachment contents reach OpenAI when the agent reads or views them.

Uploads are kept until a bucket lifecycle rule expires them. Add the rule to each deployed environment's bucket, choosing the retention period for that environment:

```sh
wrangler r2 bucket lifecycle add <bucket> expire-uploads uploads/ --expire-days <days>
```

## Deployment environments and monitoring

Use `pnpm --filter @prairielearn/course-agent deploy --env staging` or `--env production`. Set `CLOUDFLARE_ACCOUNT_ID` to the target Cloudflare account when deploying. The top-level configuration is for local development. Each named environment has its own Worker, Durable Object bindings/storage, checkpoint bucket, model/deadline vars, and secrets. Resource bindings and container configuration are repeated explicitly because Wrangler does not inherit them into named environments.

Create the matching checkpoint bucket and configure `PL_SERVICE_TOKEN`, `OPENAI_API_KEY`, and (for GitHub course sources) `GITHUB_READ_TOKEN` separately for each deployed environment. Configure PL to use the matching Worker URL and service token. Do not point staging at production conversation storage or checkpoints. No deployment or resource provisioning is performed by local checks.

Set that environment's `SENTRY_DSN` secret (`wrangler secret put SENTRY_DSN --env <environment>`) to enable error reporting; the DSN is kept out of this public repository. `SENTRY_ENVIRONMENT` and Worker version metadata identify the deployment. Reports cover Worker handlers, Durable Object/RPC operations, and handled background lifecycle failures. Reports include request URLs without query parameters and headers, including course context, with Sentry's default sensitive-header filtering. Request bodies, cookies, IP addresses, and breadcrumbs are not attached. Model and service credentials are redacted from exception messages. Local development does not report to Sentry.

Workers Logs is enabled for every environment, including Durable Object-managed container logs. Only console output is kept: invocation logs are disabled because Cloudflare does not document whether they redact request headers, and PrairieLearn sends the service token in `Authorization`. Console output covers reported errors and one structured line per milestone, each with a readable `message` (event, key fields, and elapsed ms) plus the same fields as JSON, with service credentials redacted. Turn lines (`turn_*`, timed from when the message arrived) cover start, sandbox prepare, course files started/ready and runner connected (which overlap), the workspace being ready, first reply delta, and finish. The sandbox prepare line includes the instance type; the runner logs its start and readiness, and the model proxy logs the first model request of each turn and when its response starts. Transitions to blocked states such as `startup_failed` are logged too. A runner that exits or never listens fails startup with its exit code, elapsed time, and container state. Temporarily, staging sets `DEBUG_RUNNER_OUTPUT` to forward up to 200 lines of Codex runner stderr per process and include its stderr tail in startup errors; Codex output can be sensitive, so this is never enabled in production and will be removed once staging startup is fixed. Nothing logs chat messages, prompts, model responses, or course file contents; command failures can include file paths and repository names.

Deploys defer Durable Object code updates for up to seven hours, so turns that are running at deploy time normally continue on the old code. Deferral is best effort: Cloudflare runtime updates and other platform restarts can still interrupt a turn earlier. A conversation that keeps starting new turns on the old code is still reset at seven hours, which interrupts any turn in progress. For an urgent fix, deploy with `--durable-objects-code-update-mode immediate`, which interrupts active turns.

### Rotating the service token

PrairieLearn sends the first token listed in `courseAgentServiceToken`. The Worker accepts `PL_SERVICE_TOKEN` and the optional `PL_SERVICE_TOKEN_PREVIOUS` secret. Rotate without downtime in this order, running the Worker commands from `apps/course-agent` for each deployed environment:

1. Set PrairieLearn's `courseAgentServiceToken` to `["OLD_TOKEN", "NEW_TOKEN"]` and deploy PrairieLearn.
2. Run `wrangler secret put PL_SERVICE_TOKEN_PREVIOUS --env <environment>` with the old token, then `wrangler secret put PL_SERVICE_TOKEN --env <environment>` with the new token. Each command deploys immediately, so keep this order to avoid rejecting PrairieLearn's old token.
3. Set PrairieLearn's `courseAgentServiceToken` to `["NEW_TOKEN"]` and deploy PrairieLearn.
4. Delete the old token with `wrangler secret delete PL_SERVICE_TOKEN_PREVIOUS --env <environment>`.
