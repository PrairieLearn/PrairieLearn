# `@prairielearn/course-agent`

The course agent service is a Cloudflare Worker with one `AIChatAgent` Durable Object per conversation. PrairieLearn is its only caller; browsers connect through PrairieLearn's authenticated proxy.

## Responsibilities

- **PrairieLearn:** session authentication, course-owner RBAC, private conversation catalog, conversation titles, and trusted course context.
- **Cloudflare SDK:** message persistence, streaming, reconnect/replay, explicit Stop, and interrupted-turn recovery.
- **Conversation:** pinned model, course instructions, and the model stream returned by `onChatMessage()`.

There is one SDK-owned message history and its native temporary stream buffer. The DO stores its pinned `model` and `courseContext`; PL owns its separate conversation catalog. There is no application reply-state machine, second transcript, custom replay protocol, or protected SDK stream override.

## Communication

The browser uses `useAgent()` from `agents/react` and `useAgentChat()` from `@cloudflare/ai-chat/react`. The browser connects through PrairieLearn. On each connection, the DO sends saved history using the SDK's `CF_AGENT_CHAT_MESSAGES` message, then the SDK handles replay and live output. The hook sets `getInitialMessages: null` to avoid a separate HTTP history fetch racing startup recovery. Send stays disabled until that initial transcript arrives. The SDK's history HTTP route remains available:

| Browser route                                                   | Internal service route                   | Behavior                                                                  |
| --------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| tRPC `courseAgent.create`                                       | `POST /conversations`                    | On first send, create a UUID and record it with the title in PL's catalog |
| WebSocket `/pl/course/{course}/course_agent/conversations/{id}` | WebSocket `/conversations/{uuid}`        | Native Cloudflare chat protocol: send, stream, resume, Stop               |
| `GET .../conversations/{id}/get-messages`                       | `GET /conversations/{uuid}/get-messages` | SDK-owned saved history                                                   |

Browser IDs are PL catalog IDs. Service IDs are Cloudflare-generated UUIDs. The service requires `Authorization: Bearer <PL_SERVICE_TOKEN>` on every request, including upgrades. It trusts PrairieLearn's catalog/ownership checks when routing a valid UUID.

PrairieLearn sends WebSocket upgrades through the existing Express session, authentication, and course authorization middleware before proxying. The handshake also requires a signed, user-bound prefix CSRF token in its query string. The proxy removes that token and browser cookies, replaces authorization with the service credential, and supplies `X-PL-User-Id` and `X-PL-Course-Context`. Browser state-update messages cannot overwrite the DO's model or trusted course context.

Refreshing, switching conversations, or closing the panel disconnects the reader; the SDK keeps the turn running. Returning to the same conversation loads saved history and resumes the existing stream without submitting another prompt. The selected conversation is retained per tab in session storage. The hook's `stop()` explicitly cancels the server turn, using the abort signal passed into `onChatMessage()`.

The native SDK protocol replaces the earlier HTTP `/chat` and `/stop` adapter. The SDK generates user-message/request IDs in its client and assistant-message IDs on the server. It sends the transcript using its own protocol; consumers do not construct that payload. Cloudflare still generates conversation IDs. User-message validation, transcript synchronization, and replay follow the pinned SDK's behavior rather than a separate application protocol.

Worker restart recovery is distinct from browser reconnection. The SDK saves recoverable buffered partial output; `onChatRecovery()` returns `{ continue: false }` so it does not automatically rerun an interrupted prompt. This does not promise recovery of output that had not reached the SDK's durable buffer.

Conversation-list activity indicators, unread/read markers, sandbox execution, and usage/limit infrastructure remain outside this service’s current scope.

## Local development

Assumes a working [native PrairieLearn development setup](../../docs/dev-guide/installingNative.md). Run commands from the repository root.

Copy the Worker secrets template:

```sh
cp apps/course-agent/.dev.vars.example apps/course-agent/.dev.vars
```

Set `OPENAI_API_KEY` and a random `PL_SERVICE_TOKEN` in `.dev.vars` (e.g. generate the token with `openssl rand -hex 32`).

Merge the following into `apps/prairielearn/config.json`, using the same token:

```json
{
  "isEnterprise": true,
  "courseAgentServiceUrl": "http://127.0.0.1:8790",
  "courseAgentServiceToken": "paste-the-same-PL_SERVICE_TOKEN-here",
  "features": {
    "course-agent": true
  }
}
```

Start the Worker:

```sh
pnpm --filter @prairielearn/course-agent dev --local
```

Start PrairieLearn in a second terminal:

```sh
make dev
```

Open [http://localhost:3000](http://localhost:3000), navigate to an instructor page in a non-example course (e.g. Test Course), and click the stars button at the bottom right. Both the authenticated and effective user must have Owner permission.

### HTTP requests

Set `PL_SERVICE_TOKEN` in your shell to the value from `.dev.vars`. Create a conversation:

```sh
curl --fail-with-body -X POST -H "Authorization: Bearer $PL_SERVICE_TOKEN" \
  http://localhost:8790/conversations
```

Set `conversation_id` to the returned `id`, then fetch its saved history:

```sh
curl --fail-with-body -H "Authorization: Bearer $PL_SERVICE_TOKEN" \
  "http://localhost:8790/conversations/$conversation_id/get-messages"
```

## Deployment

```sh
pnpm exec wrangler secret put PL_SERVICE_TOKEN
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm --filter @prairielearn/course-agent deploy
```

New conversations use `OPENAI_MODEL` from `wrangler.jsonc`. Each conversation persists its model at startup and keeps it across deployments. Existing conversations without a saved model adopt the configured model when next started.

After changing bindings, variables, or required secrets, regenerate `src/env.d.ts` with `pnpm --filter @prairielearn/course-agent generate-types`. CI checks it with `check-types`. Secret values belong in local `.dev.vars` or Cloudflare deployment secrets.

`PL_SERVICE_TOKEN` is a static service credential. Rotating it requires a coordinated Worker and PL change; rotation does not automatically close already accepted connections.
