import { createHmac, createSecretKey, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import cookie from 'cookie';
import * as jose from 'jose';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { config } from './config.js';
import { jwtVerifyWithKeyRing } from './jwt.js';
import { getActiveKey } from './key-ring.js';

const COOKIE_DOMAIN = 'prairielearn:workspace-sandbox-cookie:v1';
const COOKIE_GRACE_PERIOD_SEC = 5 * 60;
const WORKSPACE_SANDBOX_BOOTSTRAP_JWT_AUDIENCE = 'workspace-sandbox';
const WORKSPACE_SANDBOX_BOOTSTRAP_JWT_ISSUER = 'PrairieLearn';
const WORKSPACE_SANDBOX_BOOTSTRAP_JWT_LIFETIME = '1m';
const WORKSPACE_SANDBOX_BOOTSTRAP_JWT_PURPOSE = 'workspace-bootstrap';

const WorkspaceSandboxCookieSchema = z.object({
  version: z.literal(1),
  workspace_id: IdSchema,
  issued_at_ms: z.number().int(),
});
const WorkspaceSandboxBootstrapJwtSchema = z.object({
  purpose: z.literal(WORKSPACE_SANDBOX_BOOTSTRAP_JWT_PURPOSE),
  workspace_id: IdSchema,
});

export const WORKSPACE_SANDBOX_COOKIE_NAME = '__Host-pl_workspace_authz';

export type WorkspaceSandboxHost =
  | { type: 'not-sandbox' }
  | { type: 'invalid-sandbox-host' }
  | { type: 'workspace'; workspaceId: string };

function getWorkspaceSandboxBaseDomain(): string {
  if (config.workspaceSandboxBaseDomain == null) {
    throw new Error('workspaceSandboxBaseDomain is not configured');
  }
  return config.workspaceSandboxBaseDomain.toLowerCase();
}

export function classifyWorkspaceSandboxHost(hostname: string): WorkspaceSandboxHost {
  if (config.workspaceSandboxBaseDomain == null) return { type: 'not-sandbox' };

  const baseDomain = getWorkspaceSandboxBaseDomain();
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '');
  if (normalizedHostname !== baseDomain && !normalizedHostname.endsWith(`.${baseDomain}`)) {
    return { type: 'not-sandbox' };
  }

  const hostnamePrefix = normalizedHostname.slice(0, -(baseDomain.length + 1));
  if (!hostnamePrefix || hostnamePrefix.includes('.')) {
    return { type: 'invalid-sandbox-host' };
  }

  const match = hostnamePrefix.match(/^w(\d+)$/);
  if (!match) return { type: 'invalid-sandbox-host' };

  const workspaceId = IdSchema.safeParse(match[1]);
  if (!workspaceId.success) return { type: 'invalid-sandbox-host' };

  return {
    type: 'workspace',
    workspaceId: workspaceId.data,
  };
}

export function classifyWorkspaceSandboxRequestHost(
  req: Pick<IncomingMessage, 'headers'>,
): WorkspaceSandboxHost {
  const host = req.headers.host;
  if (host == null) return { type: 'not-sandbox' };

  try {
    return classifyWorkspaceSandboxHost(new URL(`http://${host}`).hostname);
  } catch {
    return { type: 'not-sandbox' };
  }
}

export function getAuthorizedWorkspaceSandboxHost(
  req: Pick<IncomingMessage, 'headers'>,
): Extract<WorkspaceSandboxHost, { type: 'workspace' }> | null {
  const workspaceHost = classifyWorkspaceSandboxRequestHost(req);
  if (workspaceHost.type !== 'workspace') return null;

  const cookies = cookie.parse(req.headers.cookie ?? '');
  if (!Object.hasOwn(cookies, WORKSPACE_SANDBOX_COOKIE_NAME)) return null;

  const cookieData = verifyWorkspaceSandboxCookie(cookies[WORKSPACE_SANDBOX_COOKIE_NAME]);
  if (cookieData?.workspace_id !== workspaceHost.workspaceId) return null;

  return workspaceHost;
}

export function getWorkspaceSandboxHostname({ workspaceId }: { workspaceId: string }): string {
  const parsedWorkspaceId = IdSchema.parse(workspaceId);
  return `w${parsedWorkspaceId}.${getWorkspaceSandboxBaseDomain()}`;
}

export function getWorkspaceSandboxOrigin(workspace: { workspaceId: string }): string {
  return `https://${getWorkspaceSandboxHostname(workspace)}`;
}

export function getTrustedPrairieLearnOrigin(): string {
  if (config.serverCanonicalHost == null) {
    throw new Error('serverCanonicalHost is not configured');
  }
  return new URL(config.serverCanonicalHost).origin;
}

export function getWorkspaceSandboxCookieMaxAgeMilliseconds(): number {
  return (config.workspaceLaunchedTimeoutSec + COOKIE_GRACE_PERIOD_SEC) * 1000;
}

function signCookiePayload(payload: string, key: string): string {
  return createHmac('sha256', key)
    .update(COOKIE_DOMAIN)
    .update('\0')
    .update(payload)
    .digest('base64url');
}

export function generateWorkspaceSandboxCookie(
  { workspaceId }: { workspaceId: string },
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify(
      WorkspaceSandboxCookieSchema.parse({
        version: 1,
        workspace_id: workspaceId,
        issued_at_ms: now,
      }),
    ),
  ).toString('base64url');
  const signature = signCookiePayload(payload, getActiveKey(config.secretKey));
  return `${payload}.${signature}`;
}

export function verifyWorkspaceSandboxCookie(cookie: string, now = Date.now()) {
  const parts = cookie.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const signatureBuffer = Buffer.from(signature);
  const signatureMatches = config.secretKey.some((key) => {
    const expectedSignatureBuffer = Buffer.from(signCookiePayload(payload, key));
    return (
      signatureBuffer.length === expectedSignatureBuffer.length &&
      timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    );
  });
  if (!signatureMatches) return null;

  let decodedPayload: unknown;
  try {
    decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  const parsedPayload = WorkspaceSandboxCookieSchema.safeParse(decodedPayload);
  if (!parsedPayload.success) return null;

  const age = now - parsedPayload.data.issued_at_ms;
  if (age < 0 || age > getWorkspaceSandboxCookieMaxAgeMilliseconds()) return null;

  return parsedPayload.data;
}

export async function generateWorkspaceSandboxBootstrapJwt({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<string> {
  const payload = WorkspaceSandboxBootstrapJwtSchema.parse({
    purpose: WORKSPACE_SANDBOX_BOOTSTRAP_JWT_PURPOSE,
    workspace_id: workspaceId,
  });
  const key = createSecretKey(getActiveKey(config.secretKey), 'utf-8');

  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(WORKSPACE_SANDBOX_BOOTSTRAP_JWT_AUDIENCE)
    .setIssuer(WORKSPACE_SANDBOX_BOOTSTRAP_JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(WORKSPACE_SANDBOX_BOOTSTRAP_JWT_LIFETIME)
    .sign(key);
}

export async function verifyWorkspaceSandboxBootstrapJwt(jwt: string) {
  try {
    const { payload } = await jwtVerifyWithKeyRing(jwt, config.secretKey, {
      algorithms: ['HS256'],
      audience: WORKSPACE_SANDBOX_BOOTSTRAP_JWT_AUDIENCE,
      issuer: WORKSPACE_SANDBOX_BOOTSTRAP_JWT_ISSUER,
    });
    const result = WorkspaceSandboxBootstrapJwtSchema.safeParse(payload);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
