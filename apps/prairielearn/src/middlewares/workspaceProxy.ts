import type http from 'http';
import type { Socket } from 'net';

import type express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type * as httpProxyMiddleware from 'http-proxy-middleware';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { queryOneRowAsync, queryZeroOrOneRowAsync } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { LocalCache } from '../lib/local-cache.js';

const WORKSPACE_CONTAINER_PATH_REGEXP = /^\/pl\/workspace\/([0-9]+)\/container\/(.*)/;

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
export function getStatusCode(err: any): number {
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

function getRequestPath(req: express.Request): string {
  // `req.originalUrl` won't be defined for websocket requests, but for
  // non-websocket requests, `req.url` won't contain the full path. So we
  // need to handle both.
  return req.originalUrl ?? req.url;
}

export function makeWorkspaceProxyMiddleware() {
  const workspaceUrlRewriteCache = new LocalCache(config.workspaceUrlRewriteCacheMaxAgeSec);
  const workspaceProxyOptions: httpProxyMiddleware.Options<express.Request, express.Response> = {
    target: 'invalid',
    ws: true,
    pathFilter: (_path, req) => {
      // The path provided to this function doesn't include the full path with
      // the `/pl/workspace/<workspace_id>/container/` prefix, so we need to
      // reconstruct it from the request.
      const path = getRequestPath(req);
      return WORKSPACE_CONTAINER_PATH_REGEXP.test(path);
    },
    pathRewrite: async (_path, req) => {
      // The path provided to this function doesn't include the full path with
      // the `/pl/workspace/<workspace_id>/container/` prefix, so we need to
      // reconstruct it from the request.
      const path = getRequestPath(req);

      try {
        const match = path.match(WORKSPACE_CONTAINER_PATH_REGEXP);
        if (!match) throw new Error(`Could not match path: ${path}`);
        const workspace_id = parseInt(match[1]);
        let workspace_url_rewrite = workspaceUrlRewriteCache.get(workspace_id);
        if (workspace_url_rewrite == null) {
          const sql =
            'SELECT q.workspace_url_rewrite' +
            ' FROM questions AS q' +
            ' JOIN variants AS v ON (v.question_id = q.id)' +
            ' WHERE v.workspace_id = $workspace_id;';
          const result = await queryOneRowAsync(sql, { workspace_id });
          workspace_url_rewrite = result.rows[0].workspace_url_rewrite ?? true;
          workspaceUrlRewriteCache.set(workspace_id, workspace_url_rewrite);
        }

        if (!workspace_url_rewrite) return path;

        const pathSuffix = match[2];
        const newPath = '/' + pathSuffix;
        return newPath;
      } catch (err) {
        logger.error(`Error in pathRewrite for path=${path}: ${err}`);
        return path;
      }
    },
    router: async (req) => {
      const path = getRequestPath(req);
      const match = path.match(WORKSPACE_CONTAINER_PATH_REGEXP);
      if (!match) throw new Error(`Could not match path: ${path}`);

      const workspace_id = match[1];
      const result = await queryZeroOrOneRowAsync(
        "SELECT hostname FROM workspaces WHERE id = $workspace_id AND state = 'running';",
        { workspace_id },
      );

      if (result.rows.length === 0) {
        throw new HttpStatusError(404, 'Workspace is not running');
      }

      return `http://${result.rows[0].hostname}/`;
    },
    on: {
      proxyReq: (proxyReq) => {
        stripSensitiveCookies(proxyReq);
      },
      proxyReqWs: (proxyReq) => {
        stripSensitiveCookies(proxyReq);
      },
      error: (err, req, res) => {
        logger.error(`Error proxying workspace request: ${err}`, {
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
  };
  return createProxyMiddleware(workspaceProxyOptions);
}
