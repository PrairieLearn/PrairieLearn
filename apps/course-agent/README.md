# `@prairielearn/course-agent`

The course agent service: a Cloudflare Worker with one Durable Object per conversation. PrairieLearn is its only caller; browsers never connect to it directly.

Each conversation is an `AIChatAgent`. Its native session store owns saved messages and its stream log owns temporary output. Application state still contains only the pinned model and course context. Current execution is an in-memory `idle | running | failed` state; it contains no second message history.

## API

Every request requires `Authorization: Bearer <PL_SERVICE_TOKEN>`. PrairieLearn checks course access and catalog ownership before forwarding requests. Browser routes use PL catalog IDs; the internal service uses Cloudflare UUIDs.

| Method/path                     | Input                  | Response                                                                    |
| ------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `POST /conversations`           | No body                | `201 {id}` after startup                                                    |
| `POST /conversations/{id}/chat` | `{message, context?}`  | Native AI SDK UI message SSE                                                |
| `GET /conversations/{id}/chat`  | No body                | History snapshot, reply replay/live output if running, final saved snapshot |
| `POST /conversations/{id}/stop` | `{assistantMessageId}` | `202` cancellation requested; `204` if that reply is no longer active       |

`message` has `role: "user"` and one text part. The service generates IDs; each accepted send is new work and POST is never retried automatically. `context` is the existing optional `{courseTitle, courseShortName}`. The POST response adds `X-Assistant-Message-Id` so Stop can target the reply before any text arrives.

GET uses ordinary SSE, with these JSON `data:` frames:

```ts
type ChatReadFrame =
  | { type: 'snapshot'; phase: 'initial' | 'final'; messages: UIMessage[]; reply: ClientReplyState }
  | { type: 'chunk'; chunk: UIMessageChunk }
  | { type: 'error'; message: string };

type ClientReplyState =
  | { status: 'idle' }
  | { status: 'running'; assistantMessageId: string }
  | { status: 'failed'; error: { code: string; message: string } };
```

An idle GET sends an initial snapshot and ends. A running GET excludes the unfinished assistant message from its initial history, then replays that reply's native chunks from its beginning and follows live output. A final snapshot replaces the client view after SDK persistence, including if SDK cutover deleted chunks before a slow reader consumed them. It follows the captured reply only, not future sends. The former `/messages` endpoint is removed.

Refreshing, switching, or closing an HTTP reader never cancels generation. Stop is a separate execution command scoped to the assistant ID, so a delayed Stop cannot cancel a successor. Admission stays closed until execution and persistence settle. A Worker restart saves recoverable SDK output and reports interruption without automatically rerunning inference. Failure state is temporary; it is not a durable per-message status history.

Errors retain PR 3's `400` invalid input, `401` bad service token, `404` unknown route, `409` reply already running, and `426` WebSocket-upgrade behavior. The trusted service can still instantiate an arbitrary valid conversation UUID; PL's catalog remains the existence/ownership authority.

### SDK compatibility

The pinned SDK exposes `streams.read()` but packs chunk bodies and batches writes. The adapter unpacks its own log and flushes stored chunks through protected `_storeStreamChunk` / `_flushChunkBuffer` hooks for prompt short-reply replay. `_startStream` supplies the internal stream identity. On startup, the SDK's orphan-persist/complete helpers settle recoverable output before the first HTTP read; queued recovery alone can otherwise let that read incorrectly report idle. No SDK tables or native WebSocket handlers are replaced. These are intentional pinned-version dependencies covered by real workerd replay, Stop, cutover, failure, and restart tests.

The selected conversation is kept in the URL so refreshing an older chat restores that chat. The browser keeps `useChat` / `DefaultChatTransport` for POST and uses `readUIMessageStream` for GET reply reconstruction. `eventsource-parser` handles SSE framing. There are no activity feeds, unread/read markers, additional Postgres fields, or new persisted DO application fields.

## Local development

```sh
cp .dev.vars.example .dev.vars               # then fill in PL_SERVICE_TOKEN and OPENAI_API_KEY
pnpm --filter @prairielearn/course-agent dev # http://localhost:8790
```

Try it with `curl` (set `PL_SERVICE_TOKEN` in your shell to the same local service token):

```sh
conversation_id=$(curl --fail-with-body -sS -X POST \
  -H "Authorization: Bearer $PL_SERVICE_TOKEN" \
  http://localhost:8790/conversations | python3 -c 'import json, sys; print(json.load(sys.stdin)["id"])')

curl -N --fail-with-body -H "Authorization: Bearer $PL_SERVICE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":{"role":"user","parts":[{"type":"text","text":"Hello"}]}}' \
  "http://localhost:8790/conversations/$conversation_id/chat"

curl -N --fail-with-body -H "Authorization: Bearer $PL_SERVICE_TOKEN" \
  "http://localhost:8790/conversations/$conversation_id/chat"
```

For automated provider-free checks, `test/wrangler.jsonc` runs a scripted producer with explicit dummy credentials and separate SQLite storage. It is a local test fixture, not the deployment entry point. Worker tests and the PL browser tests use this same fixture.

## Deployment

```sh
pnpm exec wrangler secret put PL_SERVICE_TOKEN
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm --filter @prairielearn/course-agent deploy
```

New conversations use `OPENAI_MODEL` from `wrangler.jsonc` (GPT-6 Luna by default). Each conversation persists its model at startup and keeps it across deployments. Existing conversations without a saved model adopt the configured model when next started.

After changing variables, bindings, or required secrets in `wrangler.jsonc`, regenerate the environment types with `pnpm --filter @prairielearn/course-agent generate-types` and commit the updated declaration file. CI runs `pnpm --filter @prairielearn/course-agent check-types` and fails if the generated types are stale. Secret values belong in `.dev.vars` locally or Cloudflare deployment secrets, never in `wrangler.jsonc`.

`PL_SERVICE_TOKEN` is a static service credential, not an expiring JWT. Store it only in deployment secrets and rotate/revoke it if compromised. For rotation, the current single-token configuration requires a coordinated change in the Worker and PrairieLearn; requests using the old token fail once the Worker switches. Short-lived service tokens and overlapping key rotation are follow-ups. Credential changes do not automatically terminate streams that were already accepted.
