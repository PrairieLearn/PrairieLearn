# `@prairielearn/course-agent`

The course agent service: a Cloudflare Worker with one Durable Object per conversation. PrairieLearn is its only caller; browsers never connect to it directly.

Each conversation is an `AIChatAgent` from the Cloudflare Agents SDK. The SDK stores the transcript (`this.messages`) and runs each turn through `saveMessages()`. Chat is served over plain HTTP instead of the SDK's WebSocket protocol, so the wire format is the AI SDK UI message stream that `useChat` understands.

## API

Every request must send `Authorization: Bearer <PL_SERVICE_TOKEN>`.

- `GET /conversations/<uuid>/messages` returns the conversation's `UIMessage[]` (`[]` for a new conversation).
- `POST /conversations/<uuid>/chat` with `{ message, context? }` streams the reply as an AI SDK UI message stream.
  - `message` is a user `UIMessage` with a single text part. Only the newest message is sent; the history lives here.
  - `context` is optional `{ courseTitle, courseShortName }`, used in the system prompt.
  - Cancelling the response stream aborts the turn and saves the partial reply. (Closing the request from PrairieLearn does not reliably cancel it yet; an explicit stop request is a follow-up.)

Errors: `400` invalid body, `401` bad or missing token, `404` unknown path, `409` a reply is already in progress or the message ID was already used, `426` WebSocket upgrade.

A conversation's Durable Object is created on first use, so there's no create endpoint. PrairieLearn generates the UUID.

## Local development

```sh
cp .dev.vars.example .dev.vars               # then fill in PL_SERVICE_TOKEN and OPENAI_API_KEY
pnpm --filter @prairielearn/course-agent dev # http://localhost:8790
```

Try it with `curl`:

```sh
curl -N -H "Authorization: Bearer $PL_SERVICE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":{"id":"m1","role":"user","parts":[{"type":"text","text":"Hello"}]}}' \
  http://localhost:8790/conversations/6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b/chat
```

## Deployment

```sh
pnpm exec wrangler secret put PL_SERVICE_TOKEN
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm --filter @prairielearn/course-agent deploy
```

The model is set by `OPENAI_MODEL` in `wrangler.jsonc`.
