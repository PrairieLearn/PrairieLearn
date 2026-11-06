import type http from 'http';
import type { Socket } from 'net';

import { type Express, type NextFunction, type Request, type Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryOptionalScalar, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import { WorkspaceSchema } from '../lib/db-types.js';
import { createUpgradeResponse } from '../lib/http-upgrade.js';
import { LocalCache } from '../lib/local-cache.js';

const sql = loadSqlEquiv(import.meta.url);

const WORKSPACE_UPGRADE_PATH = /^\/pl\/(public\/)?workspace\/\d+\/container\//;

/** Saves the bytes Node received after each upgrade request until the proxy takes over. */
const upgradeHeads = new WeakMap<http.IncomingMessage, Buffer>();

/**
 * Sends workspace WebSocket upgrades through the same Express authn/authz chain
 * as HTTP requests. The proxy middleware completes authorized upgrades.
 */
export function handleWorkspaceUpgrade(app: Express, req: http.IncomingMessage, head: Buffer) {
  if (!WORKSPACE_UPGRADE_PATH.test(req.url ?? '')) return false;
  const res = createUpgradeResponse(req);
  if (!res) return true;
  upgradeHeads.set(req, head);
  app(req, res);
  return true;
}

/**
 * Removes "sensitive" cookies from the request to avoid exposing them to
 * workspace hosts.
 */
function stripSensitiveCookies(proxyReq: http.ClientRequest) {
  const cookies = proxyReq.getHeader('cookie');
  if (!cookies) return;

  const items = (cookies as string).split(';');
  const filteredItems = items.filter((item) => {
    const name = item.split('=')[0].trim();
    return (
      name !== 'pl_authn' &&
      name !== 'pl2_authn' &&
      name !== 'pl_assessmentpw' &&
      name !== 'pl2_assessmentpw' &&
      name !== 'connect.sid' &&
      name !== 'prairielearn_session' &&
      name !== 'pl2_session' &&
      // The workspace authz cookies use a prefix plus the workspace ID, so
      // we need to check for that prefix instead of an exact name match.
      !name.startsWith('pl_authz_workspace_') &&
      !name.startsWith('pl2_authz_workspace_')
    );
  });

  proxyReq.setHeader('cookie', filteredItems.join(';'));
}

function isResponseLike(obj: any): obj is http.ServerResponse {
  return obj && typeof obj.writeHead === 'function';
}

function isSocketLike(obj: any): obj is Socket {
  return obj && typeof obj.write === 'function' && !('writeHead' in obj);
}

/**
 * Adapted from the following file in `http-proxy-middleware`:
 * https://github.com/chimurai/http-proxy-middleware/blob/e94087e8d072c0c54a6c3a6b050c590a92921482/src/status-code.ts
 */
function getStatusCode(err: any): number {
  if (err?.status) return err.status;

  if (/HPE_INVALID/.test(err?.code)) {
    return 502;
  }

  switch (err?.code) {
    case 'ECONNRESET':
    case 'ENOTFOUND':
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
      return 504;
    default:
      return 500;
  }
}

function getRequestPath(req: Request): string {
  // `req.url` won't contain the full path because the proxy is mounted on a
  // sub-path, so we use `req.originalUrl` instead.
  return req.originalUrl;
}

export function makeWorkspaceProxyMiddleware(containerPathRegex: RegExp) {
  const proxy = makeProxy(containerPathRegex);
  return (req: Request, res: Response, next: NextFunction) => {
    const head = upgradeHeads.get(req);
    if (!head) return proxy(req, res, next);

    // Transfer ownership of the socket from Express to the proxy.
    res.detachSocket(req.socket);
    // Status code 101 means Switching Protocols.
    res.statusCode = 101;
    res.emit('close');
    proxy.upgrade(req, req.socket, head);
  };
}

function makeProxy(containerPathRegex: RegExp) {
  const workspaceUrlRewriteCache = new LocalCache(config.workspaceUrlRewriteCacheMaxAgeSec);
  return createProxyMiddleware<Request, Response>({
    target: 'invalid',
    // Upgrades are forwarded explicitly by `makeWorkspaceProxyMiddleware`
    // after the Express authorization chain.
    ws: false,
    pathFilter: (_path, req) => {
      // The path provided to this function doesn't include the full path with
      // the `/pl/workspace/<workspace_id>/container/` prefix, so we need to
      // reconstruct it from the request.
      const path = getRequestPath(req);
      return containerPathRegex.test(path);
    },
    pathRewrite: async (_path, req) => {
      // The path provided to this function doesn't include the full path with
      // the `/pl/workspace/<workspace_id>/container/` prefix, so we need to
      // reconstruct it from the request.
      const path = getRequestPath(req);

      try {
        const match = path.match(containerPathRegex);
        if (!match) throw new Error(`Could not match path: ${path}`);
        const workspace_id = IdSchema.parse(match[1]);
        let workspace_url_rewrite = workspaceUrlRewriteCache.get(workspace_id);
        if (workspace_url_rewrite == null) {
          workspace_url_rewrite = await queryScalar(
            sql.select_workspace_url_rewrite,
            { workspace_id },
            z.boolean(),
          );
          workspaceUrlRewriteCache.set(workspace_id, workspace_url_rewrite);
        }

        if (!workspace_url_rewrite) return path;

        const pathSuffix = match[2];
        const newPath = '/' + pathSuffix;
        return newPath;
      } catch (err: any) {
        logger.error('Error in workspace path rewrite', { err, path });
        return path;
      }
    },
    router: async (req) => {
      const path = getRequestPath(req);
      const match = path.match(containerPathRegex);
      if (!match) throw new Error(`Could not match path: ${path}`);

      const workspace_id = IdSchema.parse(match[1]);
      const hostname = await queryOptionalScalar(
        sql.select_hostname_from_workspace_id,
        { workspace_id },
        WorkspaceSchema.shape.hostname,
      );

      if (hostname === null) {
        throw new HttpStatusError(404, 'Workspace is not running');
      }

      return `http://${hostname}/`;
    },
    on: {
      proxyReq: (proxyReq) => {
        stripSensitiveCookies(proxyReq);
      },
      proxyReqWs: (proxyReq) => {
        stripSensitiveCookies(proxyReq);
      },
      error: (err, req, res) => {
        logger.error('Error proxying workspace request', {
          err,
          url: req.url,
          originalUrl: req.originalUrl,
        });

        if (isResponseLike(res)) {
          // Check to make sure we weren't already in the middle of sending a
          // response before replying with our own error.
          if (!res.headersSent) {
            res.status(getStatusCode(err));
          }

          res.end('Error proxying workspace request');
        } else if (isSocketLike(res)) {
          // There's nothing we can do but destroy the socket.
          res.destroy();
        }
      },
    },
  });
}
