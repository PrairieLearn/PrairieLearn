# `@prairielearn/course-agent`

The internal course agent service uses one Cloudflare `AIChatAgent` Durable Object per conversation. PrairieLearn owns authentication, course permissions, and the creator-private Postgres conversation catalog. The browser never receives the service credential or connects to Cloudflare directly.

## Commands and observation

Browser commands use the course tRPC router. PrairieLearn opens an authenticated service WebSocket for each command. Browser observation uses SSE through PrairieLearn, backed by a separate service WebSocket subscription. A command and its observer can arrive through different PL servers.

| Service endpoint                                      | Purpose                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /conversations`                                 | Create an offline conversation and return its service-generated `{id}` |
| `GET /conversations/{id}/snapshot?before={messageId}` | Read a bounded history page, current status, and capabilities          |
| `GET /conversations/{id}/socket`                      | Authenticated WebSocket commands and public events                     |

All requests require `Authorization: Bearer <PL_SERVICE_TOKEN>`. PrairieLearn resolves the service ID from its authorized catalog row. The service trusts that internal caller; it does not maintain a second conversation registry.

Commands have this envelope:

```json
{ "type": "command", "ref": "request-1", "method": "conversation.subscribe", "params": {} }
```

| Command                  | Params                                            | Result                                                               |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------------------------- |
| `conversation.subscribe` | `{mode?: "full" \| "summary"}`                    | Fresh snapshot, then ordered updates; summary mode sends status only |
| `turn.start`             | `{text, context: {courseTitle, courseShortName}}` | Saved user message and accepted turn IDs                             |
| `turn.stop`              | `{turnId}`                                        | Cancellation requested; a stale Stop cannot affect a newer turn      |
| `conversation.resume`    | `{}`                                              | Reopen the composer once interrupted execution is quiescent          |

`ref` correlates one socket request with its acknowledgement. It is not a retry identity. Sends are never retried automatically; an uncertain acknowledgement is reconciled by obtaining a fresh snapshot. Every accepted send gets new server-generated turn and message IDs.

Only the public schemas in `@prairielearn/course-agent-protocol` cross the gateway. SDK state sync, generic RPC, history mutation, native chat frames, and other HTTP routes are not exposed.

## Refresh, switching, and Stop

Execution belongs to the Durable Object, independently of subscribers. Refreshing, switching conversations, hiding the panel, or losing a PL connection only detaches observation. An explicit `turn.stop` aborts generation; admission stays closed until SDK persistence finishes.

Every subscription starts with an authoritative snapshot of history, the current partial reply, status, and capabilities. A short DO event gate covers the bounded SDK history read, subscription registration, and snapshot send, so output callbacks cannot slip between the snapshot and following events. History pages use the SDK session API rather than the hydration cache, so older persisted messages remain reachable. The final persisted assistant message replaces the partial message with the same ID.

The transcript and durable chunk log remain in SDK-managed SQLite. `ChatState` contains only execution metadata and status. Its schema and status invariants are checked on every state write. The in-memory output projection supports observation but is not another persisted transcript.

### SDK compatibility boundary

The service pins `@cloudflare/ai-chat` and isolates its wire format in the `Conversation.broadcast()` adapter. This suppresses native broadcasts and translates recognized output into public parts and deltas. The SDK's constructor-installed chat handlers are replaced so they cannot intercept unvalidated native commands.

The pinned SDK batches ten output chunks in memory. Before publishing output, the adapter flushes **the SDK's own buffer** through its protected resumable-stream capability. This is an intentional SDK compatibility dependency, covered by real workerd tests: even a short partial reply survives killing and restarting the Worker. SDK upgrades must pass these tests and the native-frame rejection tests.

The prior context-only SDK state is upgraded without discarding its transcript. Since it had no durable execution status, it first requires an explicit Resume. Unknown newer state versions are rejected without overwriting them.

After a process interruption, the SDK persists buffered partial output and automatic inference continuation is disabled. The conversation becomes `blocked`. Explicit Resume reopens the composer only after SDK execution is stable; it does not repeat the interrupted prompt. The model producer is behind `createReply()`; a future sandbox producer must additionally verify native execution termination before allowing another turn.

## Dropdown activity and unread replies

While the panel is visible, a separate SSE activity feed observes lightweight summaries for its displayed catalog page (at most 50 conversations). These subscriptions carry no transcript and do not attach a host for future host tools. Changing dropdown pages replaces the observed set. Closing the panel or hiding the browser tab releases both full and summary subscriptions.

Cloudflare owns running/stopping/blocked status and the latest completed assistant-message ID. Unread markers, selected conversation, and drafts are browser preferences scoped to the authenticated user and course. A completion is marked read only after its message is rendered in the selected visible panel. Cross-device read receipts are outside this PR. No execution/status columns or operation ledger are added to Postgres.

## Local development and verification

Use the existing `.dev.vars` setup with `PL_SERVICE_TOKEN` and `OPENAI_API_KEY`, then run:

```sh
pnpm --filter @prairielearn/course-agent dev
```

Configure PrairieLearn with the matching service token, `courseAgentServiceUrl`, Enterprise development mode, and the `course-agent` flag. Open a course as its owner. To test recovery: send a message, refresh mid-reply, switch away and return, and finish a reply while another conversation is selected. Stop is available after reconnection.

The automated continuity suite uses a real Worker and real SDK storage with a scripted producer. It never calls a model provider or loads production model credentials:

```sh
pnpm --filter @prairielearn/course-agent test
pnpm test apps/prairielearn/src/tests/courseAgent.test.ts
pnpm --filter @prairielearn/prairielearn test:e2e courseAgentContinuity.spec.ts
```

`test/wrangler.jsonc` is a local-only fixture with explicit dummy credentials and control endpoints. It is never the deployment entry point. The tests cover partial replay, completion, explicit Stop, rejected native SDK mutations, authorization, lost acknowledgements, and restart without redispatch. Browser tests cover refresh/switch recovery and live unread indicators.

For a provider-free interactive demo, start the scripted Worker with automatic replies:

```sh
pnpm --filter @prairielearn/course-agent exec wrangler dev --config test/wrangler.jsonc --port 8791 --var SCRIPTED_AUTO_REPLY:true
```

Point a separate local PrairieLearn instance at `http://127.0.0.1:8791` with the fixture's `scripted-local-test-only` service token. Replies identify themselves as scripted and stream slowly enough to refresh or switch conversations midway through output.
