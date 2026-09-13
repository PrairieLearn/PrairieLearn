# Course agent Worker

This Cloudflare Worker runs the course agent in a sandbox, separately from the PrairieLearn web
server. The two applications share message schemas and types through `@prairielearn/course-agent-protocol`.

Do not copy or fork this structure to add other PrairieLearn services. It is specific to the course
agent, not an established pattern for new Workers. Introducing another Worker requires a separate
architecture discussion.

More comprehensive documentation is planned for a future PR.

`src/index.ts` describes the architecture and owns coordination. `src/codex/` contains the Codex
runner, event adapters, and their tests. The runner executes in the sandbox; the TypeScript adapters
execute in the Worker. Edit `src/codex/prompts/system.md` to change the system prompt, then rebuild
the sandbox image. The Dockerfile copies the runner and prompt into the image, outside `/workspace`.
