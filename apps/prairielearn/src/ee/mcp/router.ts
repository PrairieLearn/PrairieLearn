import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
  requireBearerAuth,
} from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { config } from '../../lib/config.js';
import { selectCourseDatasetRows } from '../lib/course-agent/course-data.js';
import {
  MCP_PATH,
  OAUTH_SCOPE_NAMES,
  getMcpResource,
  getOauthMetadata,
} from '../lib/oauth/config.js';
import { selectOptionalOauthGrantById } from '../models/oauth-grant.js';

import { mcpAuthFromAuthInfo, verifyAccessToken } from './auth.js';
import { McpAccessError, authorizeMcpCourse } from './course-access.js';
import { readCourseDataDownload } from './downloads.js';
import { buildMcpServer } from './server.js';

/**
 * PrairieLearn's MCP server, for agents that course staff connect themselves. It is mounted
 * before session authentication: requests carry an OAuth access token, never a cookie.
 */
const router = Router();

const resource = new URL(getMcpResource());

// The two documents a client reads to find out where to sign in: which authorization server
// protects this server (RFC 9728), and that server's endpoints (RFC 8414).
router.use(
  mcpAuthMetadataRouter({
    oauthMetadata: getOauthMetadata(),
    resourceServerUrl: resource,
    scopesSupported: OAUTH_SCOPE_NAMES,
    resourceName: 'PrairieLearn',
    // A development server has no HTTPS.
    dangerouslyAllowInsecureIssuerUrl: config.devMode,
  }),
);

function reportError(err: Error) {
  Sentry.captureException(err);
  logger.error('MCP server error', err);
}

// Each request gets its own server, so any PrairieLearn server can answer any request.
const mcpHandler = toNodeHandler(
  createMcpHandler((ctx) => buildMcpServer(mcpAuthFromAuthInfo(ctx.authInfo)), {
    onerror: reportError,
    // A request to be told about changes stays open for as long as the agent runs, and
    // PrairieLearn counts open requests as load. Nothing here changes between deploys, so the
    // server does not offer change notifications and refuses a request for them.
    maxSubscriptions: 0,
  }),
  { onerror: reportError },
);

router.all(
  MCP_PATH,
  requireBearerAuth({
    verifier: { verifyAccessToken },
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource),
    expectedResource: resource,
  }),
  asyncHandler(async (req, res) => {
    // The server is built from the token's details alone, so the caller's address rides along.
    if (req.auth) req.auth.extra = { ...req.auth.extra, ip: req.ip ?? null };
    await mcpHandler(req, res, req.body);
  }),
);

// One download can't exceed this, like a download into the course agent's sandbox.
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

// A course data result too large for a tool reply. The link is the credential: it is signed,
// short-lived, and good for one query. Access is still checked again when it is used.
router.get(
  `${MCP_PATH}/downloads/:token`,
  asyncHandler(async (req, res) => {
    const download = readCourseDataDownload(req.params.token);
    if (!download) throw new HttpStatusError(404, 'This download link is not valid or has expired');
    const grant = await selectOptionalOauthGrantById(download.oauth_grant_id);
    if (!grant || grant.revoked_at != null || grant.expires_at <= new Date()) {
      throw new HttpStatusError(403, 'This connection has ended');
    }
    try {
      await authorizeMcpCourse({
        auth: {
          user_id: download.user_id,
          oauth_grant_id: grant.id,
          scopes: grant.scopes,
          ip: req.ip ?? null,
        },
        course_id: download.course_id,
        scope: 'course_data:read',
      });
    } catch (err) {
      if (err instanceof McpAccessError) throw new HttpStatusError(403, err.message);
      throw err;
    }

    const { rows, signal, close } = await selectCourseDatasetRows({
      course_id: download.course_id,
      dataset: download.dataset,
      request: download.request,
    });
    res.type('application/x-ndjson');
    try {
      await pipeline(
        Readable.from(
          (async function* () {
            let bytes = 0;
            for await (const row of rows) {
              const line = `${JSON.stringify(row)}\n`;
              bytes += Buffer.byteLength(line);
              // Stops at a row boundary, so the file is valid but incomplete.
              if (bytes > MAX_DOWNLOAD_BYTES) return;
              yield line;
            }
          })(),
        ),
        res,
        { signal },
      );
    } finally {
      await close();
    }
  }),
);

export default router;
