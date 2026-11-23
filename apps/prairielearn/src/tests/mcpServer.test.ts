import * as crypto from 'node:crypto';

import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  Client,
  PROTOCOL_VERSION_META_KEY,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { SkillsClient } from '@modelcontextprotocol/client/ext/skills';
import * as cheerio from 'cheerio';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { selectActiveOauthGrantsForUser } from '../ee/models/oauth-grant.js';
import { config } from '../lib/config.js';
import {
  deleteCoursePermissions,
  insertCoursePermissionsByUserUid,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import { selectUserIsAdministrator } from '../models/user.js';

import * as helperServer from './helperServer.js';

// Nothing listens here: the tests read the redirect instead of following it.
const REDIRECT_URI = 'http://127.0.0.1:9/callback';

const siteUrl = `http://localhost:${config.serverPort}`;

function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

async function registerClient(redirect_uris = [REDIRECT_URI]) {
  const res = await fetch(`${siteUrl}/pl/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'Test agent', redirect_uris }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, string> };
}

function authorizeParams(client_id: string, challenge: string) {
  return {
    response_type: 'code',
    client_id,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'test-state',
    resource: `${siteUrl}/pl/mcp`,
  };
}

/** Approves as the signed-in development user and returns where the browser is sent. */
async function approve(
  params: Record<string, string>,
  form: [string, string][] = [
    ['scopes', 'course_data:read'],
    ['scopes', 'course:sync'],
    ['course_ids', '1'],
  ],
) {
  const page = await fetch(`${siteUrl}/pl/oauth/authorize?${new URLSearchParams(params)}`);
  assert.equal(page.status, 200);
  const $ = cheerio.load(await page.text());
  const res = await fetch(`${siteUrl}/pl/oauth/authorize`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams([
      ...Object.entries(params),
      ['__csrf_token', $('input[name="__csrf_token"]').val() as string],
      ['__action', 'approve'],
      ...form,
    ]),
  });
  return { status: res.status, location: res.headers.get('location') };
}

async function requestToken(body: Record<string, string>) {
  const res = await fetch(`${siteUrl}/pl/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, string> };
}

/** Runs the whole flow and returns the tokens an agent would hold. */
async function connect() {
  const client = await registerClient();
  const { verifier, challenge } = pkce();
  const approval = await approve(authorizeParams(client.body.client_id, challenge));
  assert.equal(approval.status, 303);
  const redirect = new URL(approval.location!);
  const code = redirect.searchParams.get('code')!;
  const tokens = await requestToken({
    grant_type: 'authorization_code',
    code,
    client_id: client.body.client_id,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    resource: `${siteUrl}/pl/mcp`,
  });
  return { client_id: client.body.client_id, code, verifier, redirect, tokens };
}

async function withMcpClient<T>(accessToken: string, run: (client: Client) => Promise<T>) {
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${siteUrl}/pl/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
    }),
  );
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

async function callTool(accessToken: string, name: string, args: Record<string, unknown>) {
  return await withMcpClient(accessToken, async (client) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[]).map((part) => part.text).join('\n');
    return { isError: result.isError === true, text };
  });
}

const QUESTIONS = { course_id: '1', dataset: 'questions', select: ['qid'], limit: 1 };

describe('MCP server', { timeout: 60_000, concurrent: false }, function () {
  const originalConfig = { isEnterprise: config.isEnterprise, features: config.features };
  let userId: string;

  beforeAll(async () => {
    // Enterprise routes must be mounted before starting the test server.
    Object.assign(config, {
      isEnterprise: true,
      features: { ...config.features, 'mcp-server': true },
    });
    await helperServer.before()();
    const user = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: config.authUid!,
      course_role: 'Owner',
      authn_user_id: '1',
    });
    userId = user.id;
    // The development user is an administrator, which must not count for a connected agent.
    assert.isTrue(await selectUserIsAdministrator(userId));
  });

  afterAll(helperServer.after);
  afterAll(() => {
    Object.assign(config, originalConfig);
  });

  test('a request without a token is told where to sign in', async function () {
    const res = await fetch(`${siteUrl}/pl/mcp`, { method: 'POST' });
    assert.equal(res.status, 401);
    assert.include(
      res.headers.get('www-authenticate'),
      `resource_metadata="${siteUrl}/.well-known/oauth-protected-resource/pl/mcp"`,
    );
    const metadata = await fetch(`${siteUrl}/.well-known/oauth-authorization-server`);
    assert.equal((await metadata.json()).token_endpoint, `${siteUrl}/pl/oauth/token`);
  });

  test('an approved agent can use the tools in the approved course only', async function () {
    const { redirect, tokens } = await connect();
    assert.equal(redirect.searchParams.get('state'), 'test-state');
    assert.equal(redirect.searchParams.get('iss'), siteUrl);
    assert.equal(tokens.status, 200);
    const access = tokens.body.access_token;

    const tools = await withMcpClient(access, async (client) => (await client.listTools()).tools);
    assert.sameMembers(
      tools.map((tool) => tool.name),
      ['get_skill', 'sync_course', 'list_course_datasets', 'get_course_data'],
    );

    const skill = await callTool(access, 'get_skill', { name: 'prairielearn-questions' });
    assert.isFalse(skill.isError);
    assert.include(skill.text, '# PrairieLearn questions');

    // The skills extension serves the same skill; the client checks the file against its digest.
    const published = await withMcpClient(access, async (client) => {
      const skills = new SkillsClient(client);
      const { skills: entries } = await skills.list();
      const entry = entries.find((skill) => skill.frontmatter.name === 'prairielearn-questions')!;
      return { entry, file: await skills.read(entry) };
    });
    assert.equal(published.entry.uri, 'skill://prairielearn/prairielearn-questions/SKILL.md');
    assert.isTrue(published.file.verified);
    assert.include(published.file.text, '# PrairieLearn questions');

    const rows = await callTool(access, 'get_course_data', QUESTIONS);
    assert.isFalse(rows.isError);
    assert.property(JSON.parse(rows.text.split('\n')[1]), 'qid');

    const unknownColumn = await callTool(access, 'get_course_data', {
      ...QUESTIONS,
      select: ['no_such_column'],
    });
    assert.isTrue(unknownColumn.isError);

    const otherCourse = await callTool(access, 'get_course_data', { ...QUESTIONS, course_id: '2' });
    assert.isTrue(otherCourse.isError);
    assert.include(otherCourse.text, 'not approved for course 2');
  });

  test('access follows the user’s current role, and not administrator rights', async function () {
    const { tokens } = await connect();
    const access = tokens.body.access_token;
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: userId,
      course_role: 'Editor',
      authn_user_id: userId,
    });
    const asEditor = await callTool(access, 'get_course_data', QUESTIONS);
    assert.isTrue(asEditor.isError);
    assert.include(asEditor.text, 'must be an owner');

    await deleteCoursePermissions({ course_id: '1', user_id: userId, authn_user_id: userId });
    assert.isTrue((await callTool(access, 'get_course_data', QUESTIONS)).isError);

    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: config.authUid!,
      course_role: 'Owner',
      authn_user_id: '1',
    });
    assert.isFalse((await callTool(access, 'get_course_data', QUESTIONS)).isError);
  });

  test('only permissions the user ticked are granted', async function () {
    const client = await registerClient();
    const { verifier, challenge } = pkce();
    const approval = await approve(authorizeParams(client.body.client_id, challenge), [
      ['scopes', 'course:sync'],
      ['course_ids', '1'],
    ]);
    const tokens = await requestToken({
      grant_type: 'authorization_code',
      code: new URL(approval.location!).searchParams.get('code')!,
      client_id: client.body.client_id,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
    assert.equal(tokens.body.scope, 'course:sync');
    const rows = await callTool(tokens.body.access_token, 'get_course_data', QUESTIONS);
    assert.isTrue(rows.isError);
    assert.include(rows.text, 'not given permission');
  });

  test('a code works once, and a second use ends the connection', async function () {
    const { client_id, code, verifier, tokens } = await connect();
    const replay = await requestToken({
      grant_type: 'authorization_code',
      code,
      client_id,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
    assert.equal(replay.status, 400);
    assert.equal(replay.body.error, 'invalid_grant');
    const res = await fetch(`${siteUrl}/pl/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.body.access_token}` },
    });
    assert.equal(res.status, 401);
  });

  test('a refresh token is replaced on use, and the old one ends the connection', async function () {
    const { client_id, tokens } = await connect();
    const refresh = { grant_type: 'refresh_token', client_id };
    const refreshed = await requestToken({ ...refresh, refresh_token: tokens.body.refresh_token });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.refresh_token, tokens.body.refresh_token);
    assert.isFalse((await callTool(refreshed.body.access_token, 'get_skill', {})).isError);

    const replay = await requestToken({ ...refresh, refresh_token: tokens.body.refresh_token });
    assert.equal(replay.body.error, 'invalid_grant');
    const res = await fetch(`${siteUrl}/pl/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshed.body.access_token}` },
    });
    assert.equal(res.status, 401);
  });

  // A request to listen for changes would stay open for as long as the agent runs.
  test('an agent is not offered change notifications, and asking for them is refused', async function () {
    const { tokens } = await connect();
    const access = tokens.body.access_token;
    const capabilities = await withMcpClient(access, async (client) =>
      client.getServerCapabilities()!,
    );
    assert.isFalse(capabilities.tools?.listChanged);
    assert.isFalse(capabilities.resources?.listChanged);

    const res = await fetch(`${siteUrl}/pl/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'Mcp-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'subscriptions/listen',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'subscriptions/listen',
        params: {
          notifications: { toolsListChanged: true },
          _meta: {
            [PROTOCOL_VERSION_META_KEY]: '2026-07-28',
            [CLIENT_INFO_META_KEY]: { name: 'test', version: '1.0.0' },
            [CLIENT_CAPABILITIES_META_KEY]: {},
          },
        },
      }),
    });
    assert.property(await res.json(), 'error');
  });

  test('the settings page lists a connected agent and can disconnect it', async function () {
    const { tokens } = await connect();
    const settings = await fetch(`${siteUrl}/pl/settings`);
    const $ = cheerio.load(await settings.text());
    assert.equal($('#agent-server-address').val(), `${siteUrl}/pl/mcp`);
    assert.include($('.list-group-item').text(), 'Test agent');

    const [{ oauth_grant }] = await selectActiveOauthGrantsForUser(userId);
    const disconnect = await fetch(`${siteUrl}/pl/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'agent_disconnect',
        __csrf_token: $('span[id=test_csrf_token]').text(),
        oauth_grant_id: oauth_grant.id,
      }),
    });
    assert.equal(disconnect.status, 200);
    const res = await fetch(`${siteUrl}/pl/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.body.access_token}` },
    });
    assert.equal(res.status, 401);
  });

  test('the token request must prove it started the flow', async function () {
    const client = await registerClient();
    const { challenge } = pkce();
    const approval = await approve(authorizeParams(client.body.client_id, challenge));
    const tokens = await requestToken({
      grant_type: 'authorization_code',
      code: new URL(approval.location!).searchParams.get('code')!,
      client_id: client.body.client_id,
      redirect_uri: REDIRECT_URI,
      code_verifier: pkce().verifier,
    });
    assert.equal(tokens.status, 400);
    assert.equal(tokens.body.error, 'invalid_grant');
  });

  test('the user is never sent to an address the agent did not register', async function () {
    const client = await registerClient();
    const params = { ...authorizeParams(client.body.client_id, pkce().challenge) };
    const res = await fetch(
      `${siteUrl}/pl/oauth/authorize?${new URLSearchParams({ ...params, redirect_uri: 'https://attacker.example/callback' })}`,
      { redirect: 'manual' },
    );
    assert.equal(res.status, 400);

    const unsafe = await registerClient(['http://attacker.example/callback']);
    assert.equal(unsafe.status, 400);
    assert.equal(unsafe.body.error, 'invalid_redirect_uri');
  });
});
