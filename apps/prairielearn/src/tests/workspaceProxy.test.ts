import { once } from 'node:events';
import { type IncomingMessage, createServer, request } from 'node:http';
import { type AddressInfo, connect } from 'node:net';

import * as cheerio from 'cheerio';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { withResolvers } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = `http://localhost:${config.serverPort}`;

const otherUser = { uid: 'other@example.com', uin: '000000099', name: 'Other User' };

async function upgradeWorkspace(workspaceId: string, cookie = '') {
  const handshake = request(`${siteUrl}/pl/workspace/${workspaceId}/container/`, {
    headers: { Connection: 'Upgrade', Upgrade: 'websocket', Cookie: cookie },
  });
  const upgraded = withResolvers<number | undefined>();
  handshake.once('error', upgraded.reject);
  handshake.once('response', (res) => {
    res.resume();
    upgraded.resolve(res.statusCode);
  });
  handshake.once('upgrade', (res, socket) => {
    socket.destroy();
    upgraded.resolve(res.statusCode);
  });
  handshake.end();
  return await upgraded.promise;
}

describe('Workspace proxy', { timeout: 20_000 }, () => {
  let forwardedUpgrade: IncomingMessage | undefined;
  const workspaceServer = createServer((req, res) => {
    if (req.headers.upgrade === 'websocket') {
      forwardedUpgrade = req;
      res.writeHead(101, { Upgrade: 'websocket', Connection: 'Upgrade' });
    }
    res.end();
  });
  let workspaceId: string;

  beforeAll(async () => {
    config.workspaceEnable = false;
    await helperServer.before()();
    workspaceServer.listen(0, '127.0.0.1');
    await once(workspaceServer, 'listening');
    await getOrCreateUser(otherUser);

    const questionId = await sqldb.queryScalar(sql.select_workspace_question_id, IdSchema);
    const response = await fetch(
      `${siteUrl}/pl/course_instance/1/instructor/question/${questionId}/preview`,
    );
    const $ = cheerio.load(await response.text());
    const href = $('a:contains("Open workspace")').attr('href');
    const match = href?.match(/\/pl\/workspace\/(\d+)/);
    assert.isOk(match);
    workspaceId = match[1];

    const { port } = workspaceServer.address() as AddressInfo;
    await sqldb.execute(sql.mark_workspace_running, {
      workspace_id: workspaceId,
      hostname: `127.0.0.1:${port}`,
    });
  });

  afterAll(async () => {
    workspaceServer.close();
    await helperServer.after();
    config.workspaceEnable = true;
  });

  // This runs first so that no HTTP request has been proxied yet.
  test('proxies WebSocket upgrades before any HTTP request', async () => {
    const cookie = `pl2_authz_workspace_${workspaceId}=secret; connect.sid=secret; keep=1`;
    assert.equal(await upgradeWorkspace(workspaceId, cookie), 101);
    assert.equal(forwardedUpgrade?.url, '/');
    assert.equal(forwardedUpgrade?.headers.cookie, 'keep=1');
  });

  test('closes upgrades pipelined behind an in-flight request', async () => {
    const socket = connect(Number(config.serverPort), 'localhost');
    await once(socket, 'connect');
    socket.resume();
    socket.write(
      'GET /pl HTTP/1.1\r\nHost: localhost\r\n\r\n' +
        `GET /pl/workspace/${workspaceId}/container/ HTTP/1.1\r\nHost: localhost\r\n` +
        'Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
    );
    await once(socket, 'close');

    const res = await fetch(`${siteUrl}/pl`);
    assert.equal(res.status, 200);
  });

  test('rejects WebSocket upgrades from users without workspace access', async () => {
    await withUser(otherUser, async () => {
      assert.equal(await upgradeWorkspace(workspaceId), 403);
    });
  });
});
