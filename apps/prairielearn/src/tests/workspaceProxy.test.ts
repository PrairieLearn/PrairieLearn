import { once } from 'node:events';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';

import * as cheerio from 'cheerio';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { withResolvers } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const siteUrl = `http://localhost:${config.serverPort}`;

describe('Workspace proxy', { timeout: 20_000 }, () => {
  const workspaceServer = createServer((req, res) => {
    if (req.headers.upgrade === 'websocket') {
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

  test('proxies WebSocket upgrades to the workspace container', async () => {
    const containerUrl = `${siteUrl}/pl/workspace/${workspaceId}/container/`;
    // http-proxy-middleware only subscribes to server upgrades after its first HTTP request.
    const response = await fetch(containerUrl);
    assert.equal(response.status, 200);

    const handshake = request(containerUrl, {
      headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
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
    assert.equal(await upgraded.promise, 101);
  });
});
