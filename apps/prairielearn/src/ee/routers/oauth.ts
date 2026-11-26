import { type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import {
  OauthFlowError,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  revokeToken,
} from '../lib/oauth/flow.js';
import { isAllowedRedirectUri } from '../lib/oauth/redirect-uri.js';
import { insertOauthClient } from '../models/oauth-client.js';

/**
 * The OAuth endpoints an agent calls directly: registering itself, exchanging a code or refresh
 * token for tokens, and revoking. They are public, because clients have no secret: a token
 * request is proven by the code and its PKCE verifier. The page where the user approves an agent
 * is `ee/pages/oauthAuthorize`.
 */
const router = Router();

function sendOauthError(res: Response, error: string, error_description: string) {
  res.status(400).json({ error, error_description });
}

// RFC 7591. The name is whatever the client claims, so the approval page labels it as unverified.
const RegistrationSchema = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().trim().min(1).max(100).optional(),
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = RegistrationSchema.safeParse(req.body);
    if (!body.success) {
      sendOauthError(res, 'invalid_client_metadata', z.prettifyError(body.error));
      return;
    }
    const invalid = body.data.redirect_uris.find((uri) => !isAllowedRedirectUri(uri));
    if (invalid !== undefined) {
      sendOauthError(
        res,
        'invalid_redirect_uri',
        `${invalid} must use HTTPS, a loopback address, or an app's own URL scheme.`,
      );
      return;
    }
    const client = await insertOauthClient({
      client_name: body.data.client_name ?? 'Unnamed app',
      redirect_uris: body.data.redirect_uris,
    });
    res.status(201).json({
      client_id: client.client_id,
      client_id_issued_at: Math.floor(client.created_at.getTime() / 1000),
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      // Every client is public, whatever it asked for.
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  }),
);

const TokenRequestSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string(),
    client_id: z.string(),
    redirect_uri: z.string(),
    code_verifier: z.string(),
    resource: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string(),
    client_id: z.string(),
  }),
]);

router.post(
  '/token',
  asyncHandler(async (req, res) => {
    const body = TokenRequestSchema.safeParse(req.body);
    if (!body.success) {
      const unsupported = !['authorization_code', 'refresh_token'].includes(req.body?.grant_type);
      sendOauthError(
        res,
        unsupported ? 'unsupported_grant_type' : 'invalid_request',
        z.prettifyError(body.error),
      );
      return;
    }
    try {
      const tokens =
        body.data.grant_type === 'authorization_code'
          ? await exchangeAuthorizationCode(body.data)
          : await exchangeRefreshToken(body.data);
      res.set('Cache-Control', 'no-store').json(tokens);
    } catch (err) {
      if (!(err instanceof OauthFlowError)) throw err;
      sendOauthError(res, err.code, err.message);
    }
  }),
);

// RFC 7009: answers 200 whether or not the token was known.
router.post(
  '/revoke',
  asyncHandler(async (req, res) => {
    const body = z.object({ token: z.string() }).safeParse(req.body);
    if (body.success) await revokeToken(body.data.token);
    res.status(200).json({});
  }),
);

export default router;
