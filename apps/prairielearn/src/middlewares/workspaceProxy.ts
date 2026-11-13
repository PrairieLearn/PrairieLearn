import type http from 'node:http';
import type { Socket } from 'node:net';

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
import {
  WORKSPACE_SANDBOX_COOKIE_NAME,
  WORKSPACE_SANDBOX_SESSION_COOKIE_NAME,
} from '../lib/workspace-sandbox.js';

const sql = loadSqlEquiv(import.meta.url);

const WORKSPACE_UPGRADE_PATH = /^\/pl\/workspace\/\d+\/container\//;

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
      name !== WORKSPACE_SANDBOX_COOKIE_NAME &&
      name !== WORKSPACE_SANDBOX_SESSION_COOKIE_NAME &&
      // The workspace authz cookies use a prefix plus the workspace ID, so
      // we need to check for that prefix instead of an exact name match.
      !name.startsWith('pl_authz_workspace_') &&
      !name.startsWith('pl2_authz_workspace_')
    );
  });

  proxyReq.setHeader('cookie', filteredItems.join(';'));
}

const RESERVED_WORKSPACE_COOKIE_NAMES = new Set([
  WORKSPACE_SANDBOX_COOKIE_NAME,
  WORKSPACE_SANDBOX_SESSION_COOKIE_NAME,
]);

export function rewriteWorkspaceContainerCookie(setCookieHeader: string): string | null {
  const [nameValue, ...attributes] = setCookieHeader.split(';');
  const separatorIndex = nameValue.indexOf('=');
  if (separatorIndex === -1) return null;

  const name = nameValue.slice(0, separatorIndex).trim();
  if (RESERVED_WORKSPACE_COOKIE_NAMES.has(name)) return null;

  const preservedAttributes = attributes.filter((attribute) => {
    const attributeName = attribute.trim().split('=', 1)[0].toLowerCase();
    return !['domain', 'partitioned', 'samesite', 'secure'].includes(attributeName);
  });

  return [
    nameValue.trim(),
    ...preservedAttributes.map((attribute) => attribute.trim()),
    'Secure',
    'SameSite=None',
    'Partitioned',
  ]
    .filter(Boolean)
    .join('; ');
}

function normalizeSetCookieHeader(header: number | string | string[] | undefined): string[] {
  if (header == null || typeof header === 'number') return [];
  return Array.isArray(header) ? header : [header];
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

interface WorkspaceProxyOptions {
  responseHeaders?: Record<string, string>;
  appendResponseHeaders?: Record<string, string>;
  removeResponseHeaders?: string[];
  cookieDomainRewrite?: string;
  rewriteContainerCookiesForCrossOrigin?: boolean;
}

export function makeWorkspaceProxyMiddleware(
  containerPathRegex: RegExp,
  options: WorkspaceProxyOptions = {},
) {
  const proxy = makeProxy(containerPathRegex, options);
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

function makeProxy(containerPathRegex: RegExp, options: WorkspaceProxyOptions) {
  const workspaceUrlRewriteCache = new LocalCache(config.workspaceUrlRewriteCacheMaxAgeSec);
  return createProxyMiddleware<Request, Response>({
    target: 'invalid',
    // Upgrades are forwarded explicitly by `makeWorkspaceProxyMiddleware`
    // after the Express authorization chain.
    ws: false,
    ...(options.cookieDomainRewrite == null
      ? {}
      : { cookieDomainRewrite: options.cookieDomainRewrite }),
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
      proxyRes: (proxyRes, _req, res) => {
        for (const header of options.removeResponseHeaders ?? []) {
          delete proxyRes.headers[header.toLowerCase()];
        }
        for (const [header, value] of Object.entries(options.responseHeaders ?? {})) {
          proxyRes.headers[header.toLowerCase()] = value;
        }
        for (const [header, value] of Object.entries(options.appendResponseHeaders ?? {})) {
          const name = header.toLowerCase();
          let existing = [proxyRes.headers[name] ?? ''].flat().join(', ');
          if (name === 'content-security-policy') {
            // Jupyter's frame-ancestors 'self' would still block the trusted parent if we only
            // appended our policy. Replace framing restrictions in every policy, keeping the rest.
            existing = existing
              .split(',')
              .map((policy) =>
                policy
                  .trim()
                  .split(';')
                  .filter((directive) => !/^\s*frame-ancestors(?:\s|$)/i.test(directive))
                  .join(';'),
              )
              .filter((policy) => policy.trim() !== '')
              .join(', ');
          }
          proxyRes.headers[name] = existing ? `${existing}, ${value}` : value;
        }

        const existingCookies = normalizeSetCookieHeader(res.getHeader('set-cookie'));
        const containerCookies = normalizeSetCookieHeader(proxyRes.headers['set-cookie']);
        const rewrittenContainerCookies = options.rewriteContainerCookiesForCrossOrigin
          ? containerCookies.flatMap((containerCookie) => {
              const rewrittenCookie = rewriteWorkspaceContainerCookie(containerCookie);
              return rewrittenCookie == null ? [] : [rewrittenCookie];
            })
          : containerCookies;
        if (existingCookies.length > 0 || rewrittenContainerCookies.length > 0) {
          proxyRes.headers['set-cookie'] = [...existingCookies, ...rewrittenContainerCookies];
        } else if (options.rewriteContainerCookiesForCrossOrigin && containerCookies.length > 0) {
          delete proxyRes.headers['set-cookie'];
        }
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
            res.setHeader('Cache-Control', 'no-store');
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
