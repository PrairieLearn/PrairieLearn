-- BLOCK tables
SELECT
  name
FROM
  sqlite_master
WHERE
  type = 'table';

-- BLOCK cf_agents_stream_blocks
DELETE FROM cf_agents_stream_blocks;

-- BLOCK cf_agents_stream_chunks
DELETE FROM cf_agents_stream_chunks;

-- BLOCK cf_agents_streams
DELETE FROM cf_agents_streams;

-- BLOCK cf_agents_chat_progress
DELETE FROM cf_agents_chat_progress;

-- BLOCK cf_ai_chat_agent_tool_milestones
DELETE FROM cf_ai_chat_agent_tool_milestones;

-- BLOCK cf_ai_chat_agent_tool_runs
DELETE FROM cf_ai_chat_agent_tool_runs;

-- BLOCK cf_ai_chat_request_context
DELETE FROM cf_ai_chat_request_context;

-- BLOCK cf_ai_chat_agent_messages
DELETE FROM cf_ai_chat_agent_messages;

-- BLOCK cf_agents_session_attachment_refs
DELETE FROM cf_agents_session_attachment_refs;

-- BLOCK cf_agents_session_attachment_chunks
DELETE FROM cf_agents_session_attachment_chunks;

-- BLOCK cf_agents_session_attachment_meta
DELETE FROM cf_agents_session_attachment_meta;

-- BLOCK cf_agents_session_message_chunks
DELETE FROM cf_agents_session_message_chunks;

-- BLOCK cf_agents_session_messages
DELETE FROM cf_agents_session_messages;

-- BLOCK cf_agents_session_compactions
DELETE FROM cf_agents_session_compactions;

-- BLOCK cf_agents_session_config
DELETE FROM cf_agents_session_config;

-- BLOCK cf_agents_session_fts
DELETE FROM cf_agents_session_fts;

-- BLOCK cf_agents_task_steps
DELETE FROM cf_agents_task_steps;

-- BLOCK cf_agents_task_runs
DELETE FROM cf_agents_task_runs;

-- BLOCK cf_agent_tool_runs
DELETE FROM cf_agent_tool_runs;

-- BLOCK cf_agents_fibers
DELETE FROM cf_agents_fibers;

-- BLOCK cf_agents_facet_runs
DELETE FROM cf_agents_facet_runs;

-- BLOCK cf_agents_runs
DELETE FROM cf_agents_runs;

-- BLOCK cf_agents_queues
DELETE FROM cf_agents_queues;

-- BLOCK cf_agents_workflows
DELETE FROM cf_agents_workflows;

-- BLOCK execution_receipts
DELETE FROM execution_receipts;

-- BLOCK rejected_dispatches
DELETE FROM rejected_dispatches;
