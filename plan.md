- Create `threads` table. This will store conversation threads. A given question may have multiple threads (e.g. one for generation, and one for iteration after the draft is finalized).
- Create `messages` table. This will store individual messages in a thread. It will store both `user` and `assistant` messages (its `role`). It will store a JSON array of compacted message parts - e.g. `text` but not `text-delta`/`text-end`, and `tool-call` and `tool-call-result` but not `tool-input-delta`.
- Create a `message_parts` table. This will store individual parts of messages as they're streamed in. We'll flush to this table periodically - maybe every 10 parts or 1 second.

- As parts are streamed in, they're stored in `message_parts`.
- Once a message is complete, its parts are stored in a JSONB array in the `messages` row.

---

# Redis

- We'll use Redis streams to store incoming message parts temporarily.
  - This will allow us to decouple the machine that's executing the agentic loop from the machine that's serving up the SSE stream to the client.
  - This will also give us an easy way to resume interrupted streams (see https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams).
- We'll also use Redis pub/sub to distribute "stop" signals to the machine that's running the agentic loop.
