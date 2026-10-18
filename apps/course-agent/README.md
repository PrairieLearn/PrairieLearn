# `@prairielearn/course-agent`

The course agent service: a Cloudflare Worker with one Durable Object per conversation. PrairieLearn is its only caller; browsers never connect to it directly.

Each conversation is an `AIChatAgent` from the Cloudflare Agents SDK. The SDK stores the transcript (`this.messages`) and runs each turn through `saveMessages()`. Chat is served over plain HTTP instead of the SDK's WebSocket protocol, so the wire format is the AI SDK UI message stream that `useChat` understands.

## API

Every request must send `Authorization: Bearer <PL_SERVICE_TOKEN>`.

- `POST /conversations` returns `201` with `{ "id": "<uuid>" }`. No body is needed; the service generates the conversation ID.
- `GET /conversations/<uuid>/messages` returns the conversation's `UIMessage[]` (`[]` for a new conversation).
- `POST /conversations/<uuid>/chat` with `{ message, context? }` streams the reply as an AI SDK UI message stream.
  - `message` contains `role: "user"` and a single text part in `parts`. Do not send a message ID; the service generates it. Only the newest message is sent; the history lives here.
  - Each accepted POST creates a new message, even if the text is identical. There is no retry deduplication or response replay; callers should not automatically retry submissions. Generated message IDs are available in the conversation history.
  - `context` is optional `{ courseTitle, courseShortName }`, used in the system prompt. The last supplied context is persisted in SDK state for restart recovery; omit it to reuse that context. PrairieLearn remains authoritative and can refresh it on subsequent requests.
  - Cancelling the response stream aborts the turn and saves the partial reply. (Closing the request from PrairieLearn does not reliably cancel it yet; an explicit stop request is a follow-up.)

Errors: `400` invalid body, `401` bad or missing token, `404` unknown path, `409` a reply is already in progress, `426` WebSocket upgrade.

The ID endpoint only generates an identifier; the conversation's Durable Object storage is initialized on first access. PrairieLearn stores the returned ID in its conversation catalog.

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

curl --fail-with-body -H "Authorization: Bearer $PL_SERVICE_TOKEN" \
  "http://localhost:8790/conversations/$conversation_id/messages"
```

## Deployment

```sh
pnpm exec wrangler secret put PL_SERVICE_TOKEN
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm --filter @prairielearn/course-agent deploy
```

The model is set by `OPENAI_MODEL` in `wrangler.jsonc`.

`PL_SERVICE_TOKEN` is a static service credential, not an expiring JWT. Store it only in deployment secrets and rotate/revoke it if compromised. For rotation, the current single-token configuration requires a coordinated change in the Worker and PrairieLearn; requests using the old token fail once the Worker switches. Short-lived service tokens and overlapping key rotation are follow-ups. Credential changes do not automatically terminate streams that were already accepted.
