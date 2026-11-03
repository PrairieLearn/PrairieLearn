# Course agent

A Cloudflare Worker backend that coordinates PrairieLearn course agent conversations, running Codex sessions in Cloudflare Sandboxes to create and modify course content.

## Local usage

Start with a working [native PrairieLearn development setup](../../docs/dev-guide/installingNative.md) and Docker running. Run the following commands from the repository root.

Copy the secrets template:

```sh
cp apps/course-agent/.dev.vars.example apps/course-agent/.dev.vars
```

Set `OPENAI_API_KEY` and `PL_SERVICE_TOKEN` in `apps/course-agent/.dev.vars`. Set `PL_SERVICE_URL` to your local PrairieLearn origin if it differs from the template’s `http://localhost:3000`. Generate a service token with:

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
