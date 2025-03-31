import type http from 'http';

import { createProxyMiddleware } from 'http-proxy-middleware';
import type * as httpProxyMiddleware from 'http-proxy-middleware';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { queryOneRowAsync, queryZeroOrOneRowAsync } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { LocalCache } from '../lib/local-cache.js';

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

export function makeWorkspaceProxyMiddleware() {
  const workspaceUrlRewriteCache = new LocalCache(config.workspaceUrlRewriteCacheMaxAgeSec);
  const workspaceProxyOptions: httpProxyMiddleware.Options = {
    target: 'invalid',
    ws: true,
    pathRewrite: async (path) => {
      try {
        const match = path.match('/pl/workspace/([0-9]+)/container/(.*)');
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
          workspace_url_rewrite = result.rows[0].workspace_url_rewrite;
          if (workspace_url_rewrite == null) workspace_url_rewrite = true;
          workspaceUrlRewriteCache.set(workspace_id, workspace_url_rewrite);
        }
        if (!workspace_url_rewrite) {
          return path;
        }
        const pathSuffix = match[2];
        const newPath = '/' + pathSuffix;
        return newPath;
      } catch (err) {
        logger.error(`Error in pathRewrite for path=${path}: ${err}`);
        return path;
      }
    },
    logLevel: 'silent',
    logProvider: (_provider) => logger,
    router: async (req) => {
      const match = req.url.match(/^\/pl\/workspace\/([0-9]+)\/container\//);
      if (!match) throw new Error(`Could not match URL: ${req.url}`);

      const workspace_id = match[1];
      const result = await queryZeroOrOneRowAsync(
        "SELECT hostname FROM workspaces WHERE id = $workspace_id AND state = 'running';",
        { workspace_id },
      );

      if (result.rows.length === 0) {
        // If updating this message, also update the message our Sentry
        // `beforeSend` handler.
        throw new HttpStatusError(404, 'Workspace is not running');
      }

      return `http://${result.rows[0].hostname}/`;
    },
    onProxyReq: (proxyReq) => {
      stripSensitiveCookies(proxyReq);
    },
    onProxyReqWs: (proxyReq) => {
      stripSensitiveCookies(proxyReq);
    },
    onError: (err, req, res) => {
      logger.error(`Error proxying workspace request: ${err}`, {
        err,
        url: req.url,
        originalUrl: req.originalUrl,
      });
      // Check to make sure we weren't already in the middle of sending a
      // response before replying with an error 500
      if (res && !res.headersSent) {
        res.status?.((err as any).status ?? 500)?.send?.('Error proxying workspace request');
      }
    },
  };
  return createProxyMiddleware((pathname) => {
    return !!pathname.match('/pl/workspace/([0-9])+/container/');
  }, workspaceProxyOptions);
}
