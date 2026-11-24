CREATE TABLE IF NOT EXISTS course_agent_actions (
  id bigserial PRIMARY KEY,
  course_agent_conversation_id bigint NOT NULL REFERENCES course_agent_conversations ON UPDATE CASCADE ON DELETE CASCADE,
  -- Names the request in the course agent service. Its decision and result are the
  -- course_agent_reviews row with the same ID, since a request waits in the review slot.
  agent_action_id uuid NOT NULL,
  -- The action's name in the course agent action registry.
  action text NOT NULL,
  -- The input as the agent sent it. It is validated when requested and again when approved.
  input jsonb NOT NULL,
  -- What the instructor is shown when deciding, in the shape of CourseActionCardSchema. The
  -- action runs only if it still says the same.
  card jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_agent_actions_conversation_action_key UNIQUE (course_agent_conversation_id, agent_action_id)
);
