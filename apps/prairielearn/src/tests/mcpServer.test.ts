import * as crypto from 'node:crypto';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { SkillsClient } from '@modelcontextprotocol/client/ext/skills';
import * as cheerio from 'cheerio';
import fetchCookie from 'fetch-cookie';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { selectOptionalOauthRecord } from '../ee/models/oauth-record.js';
import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

// Nothing listens here: the tests read the redirect instead of following it.
const REDIRECT_URI = 'http://127.0.0.1:9/callback';

const siteUrl = `http://localhost:${config.serverPort}`;

/**
 * Connects an agent the way a real one does: it registers, the signed-in user approves it in a
 * browser (`browser` keeps that browser's cookies), and it exchanges the code for tokens.
 */
async function connect(browser = fetchCookie(fetch)) {
  const registration = await fetch(`${siteUrl}/pl/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test agent',
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      // Claude Code names the scope it will ask for, which the library only accepts if it knows it.
      scope: 'skills:read',
    }),
  });
  assert.equal(registration.status, 201);
  const { client_id } = (await registration.json()) as { client_id: string };

  const verifier = crypto.randomBytes(32).toString('base64url');
  const approvalPage = await browser(
    `${siteUrl}/pl/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      scope: 'skills:read',
      resource: `${siteUrl}/pl/mcp`,
    })}`,
  );
  assert.equal(approvalPage.status, 200);
  const $ = cheerio.load(await approvalPage.text());
  const approval = await browser(approvalPage.url, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      __csrf_token: $('input[name="__csrf_token"]').val() as string,
      __action: 'approve',
    }),
  });
  let resumed = await browser(approval.headers.get('location')!, { redirect: 'manual' });
  if (resumed.status === 200) {
    // The authorization server's own session held another user, so it ends that session first,
    // with a form that a browser submits by itself.
    const form = cheerio.load(await resumed.text())('form');
    const ended = await browser(form.attr('action')!, {
      method: 'POST',
      redirect: 'manual',
      body: new URLSearchParams(form.serializeArray().map(({ name, value }) => [name, value])),
    });
    resumed = await browser(ended.headers.get('location')!, { redirect: 'manual' });
  }
  const code = new URL(resumed.headers.get('location')!).searchParams.get('code')!;

  const tokens = await fetch(`${siteUrl}/pl/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  assert.equal(tokens.status, 200);
  return {
    approvalPageText: $('h1').parent().text(),
    tokens: (await tokens.json()) as { access_token: string; refresh_token: string },
  };
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

async function mcpStatus(accessToken: string) {
  const res = await fetch(`${siteUrl}/pl/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.status;
}

describe('MCP server', { timeout: 60_000, concurrent: false }, function () {
  const originalConfig = { isEnterprise: config.isEnterprise, features: config.features };

  beforeAll(async () => {
    // Enterprise routes must be mounted before starting the test server.
    Object.assign(config, {
      isEnterprise: true,
      features: { ...config.features, 'mcp-server': true },
    });
    await helperServer.before()();
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

    const resource = await fetch(`${siteUrl}/.well-known/oauth-protected-resource/pl/mcp`);
    const issuer = `${siteUrl}/pl/oauth`;
    assert.deepEqual((await resource.json()).authorization_servers, [issuer]);

    // The address RFC 8414 gives for an issuer with a path, which is not where the library is.
    const server = await fetch(`${siteUrl}/.well-known/oauth-authorization-server/pl/oauth`);
    const metadata = await server.json();
    assert.equal(metadata.issuer, issuer);
    assert.equal(metadata.token_endpoint, `${issuer}/token`);
    assert.equal(metadata.registration_endpoint, `${issuer}/register`);
  });

  test('an agent the user approves can read the skills', async function () {
    const { tokens } = await connect();
    // Without a refresh token the user would have to approve again every hour.
    assert.isString(tokens.refresh_token);

    await withMcpClient(tokens.access_token, async (client) => {
      const { tools } = await client.listTools();
      assert.sameMembers(
        tools.map((tool) => tool.name),
        ['get_skill'],
      );

      const result = await client.callTool({
        name: 'get_skill',
        arguments: { name: 'prairielearn-questions' },
      });
      assert.include((result.content as { text: string }[])[0].text, '# PrairieLearn questions');

      // The skills extension serves the same skill; the client checks the file against its digest.
      const skills = new SkillsClient(client);
      const { skills: entries } = await skills.list();
      const entry = entries.find((skill) => skill.frontmatter.name === 'prairielearn-questions')!;
      assert.isTrue((await skills.read(entry)).verified);

      // An agent told that the lists can change holds a request open to listen for changes.
      const capabilities = client.getServerCapabilities()!;
      assert.isFalse(capabilities.tools?.listChanged);
      assert.isFalse(capabilities.resources?.listChanged);
    });
  });

  test('tokens are stored only as hashes', async function () {
    const { tokens } = await connect();
    for (const [model, token] of [
      ['AccessToken', tokens.access_token],
      ['RefreshToken', tokens.refresh_token],
    ]) {
      assert.isNull(await selectOptionalOauthRecord({ model, id: token }));
      const record = await selectOptionalOauthRecord({
        model,
        id: crypto.createHash('sha256').update(token).digest('hex'),
      });
      assert.notInclude(JSON.stringify(record!.payload), token);
    }
  });

  test('the user who approves is the one signed in to PrairieLearn', async function () {
    // One browser, in which a second user signs in to PrairieLearn after the first has approved
    // an agent: it still holds the authorization server's own session cookies, which must not
    // carry the first user over.
    const firstJar = new fetchCookie.toughCookie.CookieJar();
    await connect(fetchCookie(fetch, firstJar));
    const secondJar = new fetchCookie.toughCookie.CookieJar();
    for (const cookie of await firstJar.getCookies(`${siteUrl}/pl/oauth/authorize`)) {
      if (cookie.key.startsWith('_session')) await secondJar.setCookie(cookie, siteUrl);
    }
    const browser = fetchCookie(fetch, secondJar);
    const other = { uid: 'other@example.com', name: 'Other User', uin: '000000002' };
    const otherUser = await getOrCreateUser(other);
    const { approvalPageText, tokens } = await withUser(other, async () => await connect(browser));
    assert.include(approvalPageText, 'Other User');

    const record = await selectOptionalOauthRecord({
      model: 'AccessToken',
      id: crypto.createHash('sha256').update(tokens.access_token).digest('hex'),
    });
    assert.equal(record!.user_id, otherUser.id);
  });

  test('the settings page lists a connected agent and can disconnect it', async function () {
    const { tokens } = await connect();
    const settings = await fetch(`${siteUrl}/pl/settings`);
    const $ = cheerio.load(await settings.text());
    assert.equal($('#agent-server-address').val(), `${siteUrl}/pl/mcp`);
    assert.include($('.list-group-item').text(), 'Test agent');

    const record = await selectOptionalOauthRecord({
      model: 'AccessToken',
      id: crypto.createHash('sha256').update(tokens.access_token).digest('hex'),
    });
    const disconnect = await fetch(`${siteUrl}/pl/settings`, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'agent_disconnect',
        __csrf_token: $('span[id=test_csrf_token]').text(),
        oauth_grant_id: record!.grant_id!,
      }),
    });
    assert.equal(disconnect.status, 200);
    assert.equal(await mcpStatus(tokens.access_token), 401);
  });

  test('turning the feature off ends existing connections', async function () {
    const { tokens } = await connect();
    const { features } = config;
    config.features = { ...features, 'mcp-server': false };
    try {
      assert.equal(await mcpStatus(tokens.access_token), 401);
    } finally {
      config.features = features;
    }
  });
});
