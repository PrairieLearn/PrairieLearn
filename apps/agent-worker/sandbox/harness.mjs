import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { query } from '@anthropic-ai/claude-agent-sdk';

import { HttpSessionStore } from './session-store.mjs';
import { callPrairieLearnTool, createPrairieLearnMcpServer } from './tool-adapter.mjs';

const coursePath = '/workspace/course';
const eventsUrl = 'http://worker-events.internal/events';
const configPath = process.argv[2];
const execFileAsync = promisify(execFile);
const authoringSystemPrompt = `You are the PrairieLearn course-authoring agent for one instructor-owned course repository.

- Work only inside /workspace/course. Inspect and follow the repository's existing conventions.
- You may use Bash for local analysis and scripts. Never push Git refs or attempt to obtain credentials.
- Use the PrairieLearn MCP tools for course entities, instructor-visible data, job output, and question rendering instead of guessing server state.
- Before calling render_question, stage and commit the complete question change. The render tool previews exactly one deterministic variant from that committed tree; fix reported issues, commit, and render again when needed.
- Keep all intended changes committed. In the final response, summarize what changed, the checks or preview performed, and any unresolved issue. Publication is a separate instructor action.`;

if (!configPath) throw new Error('Harness configuration path is required');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const result =
  config.harness === 'claude'
    ? await runClaudeHarness(config)
    : await runDeterministicHarness(config);
process.stdout.write(`${JSON.stringify(result)}\n`);

async function runDeterministicHarness(config) {
  if (process.getuid?.() === 0) throw new Error('Agent harness must not run as root');
  for (const name of ['ANTHROPIC_API_KEY', 'GITHUB_READ_TOKEN', 'GITHUB_WRITE_TOKEN']) {
    if (process.env[name]) {
      throw new Error(`${name} must not be present in the harness environment`);
    }
  }
  try {
    await access('/opt/prairielearn-agent/harness.mjs', fsConstants.W_OK);
    throw new Error('Agent harness adapter files must be immutable');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Agent harness adapter files must be immutable'
    ) {
      throw error;
    }
  }
  const store = new HttpSessionStore();
  const sessionId = config.resume_session_id ?? randomUUID();
  const projectKey = coursePath;
  const userEntry = {
    type: 'user',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    message: { role: 'user', content: config.prompt },
  };
  const assistantText = `Deterministic response for: ${config.prompt}`;
  const assistantEntry = {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    message: { role: 'assistant', content: assistantText },
  };

  await store.append({ projectKey, sessionId }, [userEntry]);
  await store.append({ projectKey, sessionId }, [userEntry]);
  await store.append({ projectKey, sessionId, subpath: 'subagents/agent-deterministic' }, [
    {
      type: 'agent_metadata',
      uuid: randomUUID(),
      timestamp: new Date().toISOString(),
      parentAgentId: null,
    },
  ]);

  const toolResults = {};
  if (config.allowed_tools.includes('list_entities')) {
    toolResults.list_entities = await callTool('list_entities', { scope: 'questions' });
  }
  if (config.allowed_tools.includes('read_course_file')) {
    toolResults.read_course_file = await callTool('read_course_file', { path: 'README.md' });
  }
  if (config.local_development && config.allowed_tools.includes('query_course_data')) {
    toolResults.query_course_data = await callTool('query_course_data', {
      query: 'SELECT id, qid FROM questions ORDER BY id LIMIT 1',
    });
  }

  if (config.prompt.includes('[wait-for-cancel]')) {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }

  const listedQid = firstQuestionId(toolResults.list_entities);
  const qid = `agent-generated-${config.run_id.replaceAll(/[^A-Za-z0-9._-]/g, '-')}`;
  const questionPath = `${coursePath}/questions/${qid}`;
  await mkdir(questionPath, { recursive: true });
  await writeFile(
    `${questionPath}/question.html`,
    '<pl-question-panel><p>Deterministic agent edit</p></pl-question-panel>\n',
  );
  await writeFile(
    `${questionPath}/info.json`,
    `${JSON.stringify({ title: 'Agent edit' }, null, 2)}\n`,
  );
  await writeFile(
    `${questionPath}/server.py`,
    'def generate(data):\n    data["params"]["agent"] = True\n',
  );
  await writeFile(
    `${coursePath}/agent-output.txt`,
    `${assistantText}\n${JSON.stringify(toolResults)}\n`,
  );
  await runGit(['add', 'agent-output.txt', `questions/${qid}`]);
  await runGit(['commit', '--allow-empty', '-m', `Agent turn ${config.run_id}`]);
  if (config.allowed_tools.includes('render_question')) {
    toolResults.render_question = await callTool('render_question', { qid, variant_seed: '1' });
    if (
      toolResults.render_question?.result?.rendered !== true ||
      toolResults.render_question?.result?.variant_seed !== '1'
    ) {
      throw new Error('Deterministic render_question did not return a rendered question');
    }
  }
  await store.append({ projectKey, sessionId }, [assistantEntry]);
  const loaded = await store.load({ projectKey, sessionId });
  const subkeys = await store.listSubkeys({ projectKey, sessionId });
  await emit([
    { type: 'assistant_message_delta', data: { text: assistantText } },
    { type: 'assistant_message', data: { text: assistantText } },
  ]);

  return {
    session_id: sessionId,
    transcript_entries: loaded?.length ?? 0,
    listed_qid: listedQid,
    rendered_qid: qid,
    runtime_uid: process.getuid?.(),
    adapter_immutable: true,
    secret_env_absent: true,
    subkeys,
  };
}

async function callTool(name, input) {
  const operationId = randomUUID();
  return await callPrairieLearnTool(name, input, undefined, operationId);
}

function firstQuestionId(result) {
  const entities = result?.result?.entities;
  if (!Array.isArray(entities) || entities.length === 0) return undefined;
  const entity = entities[0];
  return typeof entity?.qid === 'string' ? entity.qid : undefined;
}

async function runClaudeHarness(config) {
  const store = new HttpSessionStore();
  const mcpServer = createPrairieLearnMcpServer(config.allowed_tools);
  let sessionId = config.resume_session_id;
  let finalResult;
  let mirrorFailed = false;

  const conversation = query({
    prompt: config.prompt,
    options: {
      cwd: coursePath,
      resume: config.resume_session_id,
      sessionStore: store,
      sessionStoreFlush: 'batched',
      mcpServers: { prairielearn: mcpServer },
      allowedTools: [
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
        'Bash',
        ...config.allowed_tools.map((name) => `mcp__prairielearn__${name}`),
      ],
      disallowedTools: ['WebFetch', 'WebSearch'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      maxTurns: 20,
      systemPrompt: authoringSystemPrompt,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: 'worker-injected',
        CLAUDE_CONFIG_DIR: '/tmp/prairielearn-claude',
      },
    },
  });

  for await (const message of conversation) {
    if ('session_id' in message && message.session_id) sessionId = message.session_id;
    if (message.type === 'system' && message.subtype === 'mirror_error') {
      mirrorFailed = true;
    } else if (message.type === 'assistant') {
      await emit([{ type: 'assistant_message', data: { message: message.message } }]);
    } else if (message.type === 'result') {
      finalResult = message;
    }
  }

  if (mirrorFailed) throw new Error('Claude transcript mirroring failed');
  if (!sessionId) throw new Error('Claude harness did not return a session ID');
  await runGit(['add', '--all']);
  await runGit(['commit', '--allow-empty', '-m', `Agent turn ${config.run_id}`]);
  return { session_id: sessionId, result: finalResult };
}

async function emit(events) {
  const stableEvents = events.map((event) => ({
    event_id: event.event_id ?? randomUUID(),
    ...event,
  }));
  const response = await fetch(eventsUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: stableEvents }),
  });
  if (!response.ok) throw new Error(`Event forwarding failed: ${await response.text()}`);
}

async function runGit(args) {
  await execFileAsync('git', ['-C', coursePath, ...args], { maxBuffer: 1_000_000 });
}
