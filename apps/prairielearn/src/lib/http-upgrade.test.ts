import { once } from 'node:events';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createUpgradeResponse } from './http-upgrade.js';

describe('createUpgradeResponse', () => {
  let server: http.Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('survives a client reset before the upgrade is handled', async () => {
    server = http.createServer();
    const upgradeSocket = new Promise<net.Socket>((resolve) => {
      server!.on('upgrade', (req: http.IncomingMessage) => {
        // Leave the response pending, like the Express authorization chain.
        createUpgradeResponse(req);
        resolve(req.socket);
      });
    });
    server.listen(0);
    await once(server, 'listening');

    const client = net.connect((server.address() as AddressInfo).port);
    await once(client, 'connect');
    client.write(
      'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
    );
    const socket = await upgradeSocket;
    client.resetAndDestroy();

    // Not `once()`, which would add an `error` listener of its own.
    await new Promise((resolve) => socket.on('close', resolve));
    expect(socket.destroyed).toBe(true);
  });
});
