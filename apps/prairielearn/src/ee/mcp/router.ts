import {
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
} from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import {
  MCP_PATH,
  OAUTH_PATH,
  OAUTH_SCOPE_NAMES,
  getMcpResource,
  getOauthIssuer,
} from '../lib/oauth/config.js';
import { getOauthProvider } from '../lib/oauth/provider.js';

import { mcpAuthFromAuthInfo, verifyAccessToken } from './auth.js';
import { buildMcpServer } from './server.js';

/**
 * PrairieLearn's MCP server, for agents that course staff connect themselves, and the OAuth
 * authorization server that issues its tokens. Both are mounted before session authentication:
 * requests carry an access token or are part of getting one, and never rely on a cookie of
 * PrairieLearn's. The page where the user approves an agent is `ee/pages/agentApproval`.
 */
const router = Router();

const resource = new URL(getMcpResource());
const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
const oauth = getOauthProvider().callback();

// A client looks for the authorization server's metadata under `/.well-known` at the root, with
// the issuer's path appended (RFC 8414). The library serves it under its own path, so the request
// is passed on to it there.
const OAUTH_METADATA_PATH = '/.well-known/oauth-authorization-server';
router.get(`${OAUTH_METADATA_PATH}${OAUTH_PATH}`, (req, res, next) => {
  req.url = `${OAUTH_PATH}${OAUTH_METADATA_PATH}`;
  next();
});

router.use(OAUTH_PATH, oauth);

// Tells a client which authorization server protects the MCP server (RFC 9728).
router.get(new URL(resourceMetadataUrl).pathname, (req, res) => {
  res.json({
    resource: resource.href,
    authorization_servers: [getOauthIssuer()],
    scopes_supported: OAUTH_SCOPE_NAMES,
    bearer_methods_supported: ['header'],
    resource_name: 'PrairieLearn',
  });
});

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
    resourceMetadataUrl,
    expectedResource: resource,
  }),
  asyncHandler(async (req, res) => {
    await mcpHandler(req, res, req.body);
  }),
);

export default router;
