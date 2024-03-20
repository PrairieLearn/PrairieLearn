import * as express from 'express';
import { Server } from 'node:http';

export interface WithServerContext {
  server: Server;
  port: number;
  url: string;
}

export async function withServer(
  app: express.Express,
  fn: (ctx: WithServerContext) => Promise<void>,
) {
  const server = app.listen();

  await new Promise<void>((resolve, reject) => {
    server.on('listening', () => resolve());
    server.on('error', (err) => reject(err));
  });

  try {
    await fn({
      server,
      port: getServerPort(server),
      url: `http://localhost:${getServerPort(server)}`,
    });
  } finally {
    server.close();
  }
}

function getServerPort(server: Server): number {
  const address = server.address();

  // istanbul ignore next
  if (!address) throw new Error('Server is not listening');

  // istanbul ignore next
  if (typeof address === 'string') throw new Error('Server is listening on a pipe');

  return address.port;
}
