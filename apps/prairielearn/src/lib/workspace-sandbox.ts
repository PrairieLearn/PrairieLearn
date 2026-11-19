import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import cookie from 'cookie';
import { z } from 'zod';

import {
  checkSignedToken,
  generateSignedToken,
  getCheckedSignedTokenData,
} from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import {
  consumeWorkspaceBootstrapToken,
  insertWorkspaceBootstrapToken,
} from '../models/workspace-bootstrap-token.js';

import { config } from './config.js';
import { features } from './features/index.js';
import { idsEqual } from './id.js';

const WORKSPACE_SANDBOX_AUTHORIZATION_COOKIE_PURPOSE = 'workspace-sandbox-authorization';
const WORKSPACE_SANDBOX_SESSION_COOKIE_PURPOSE = 'workspace-sandbox-session';

const WORKSPACE_AUTHORIZATION_COOKIE_NAMES = [
  'load_test_token',
  'pl2_access_as_administrator',
  'pl2_assessmentpw',
  'pl2_disable_auto_authn',
  'pl2_requested_course_instance_role',
  'pl2_requested_course_role',
  'pl2_requested_date',
  'pl2_requested_uid',
  'pl_test_date',
  'pl_test_mode',
  'pl_test_user',
] as const;

const WorkspaceAuthorizationCookiesSchema = z.record(z.string(), z.string());

export const WORKSPACE_SANDBOX_COOKIE_NAME = '__Host-pl_workspace_authz';
export const WORKSPACE_SANDBOX_SESSION_COOKIE_NAME = '__Host-pl_workspace_session';

const WorkspaceSandboxSessionSchema = z.object({
  authorization_cookies: WorkspaceAuthorizationCookiesSchema,
  public_question_endpoint: z.boolean(),
  purpose: z.literal(WORKSPACE_SANDBOX_SESSION_COOKIE_PURPOSE),
  session_id: z.string().min(1),
  version: z.literal(1),
  workspace_id: IdSchema,
});

export type WorkspaceSandboxSession = z.infer<typeof WorkspaceSandboxSessionSchema>;

export type WorkspaceSandboxHost =
  | { type: 'not-sandbox' }
  | { type: 'invalid-sandbox-host' }
  | { type: 'workspace'; workspaceId: string };

export type WorkspaceSandboxAccessResult =
  | {
      authorized: true;
      workspaceHost: Extract<WorkspaceSandboxHost, { type: 'workspace' }>;
    }
  | {
      authorized: false;
      reason: 'invalid-host' | 'invalid-origin' | 'workspace-mismatch' | 'unauthorized';
    };

function validateWorkspaceSandboxHost(
  req: Pick<IncomingMessage, 'headers'>,
  expectedWorkspaceId: string,
): WorkspaceSandboxAccessResult {
  const workspaceId = IdSchema.safeParse(expectedWorkspaceId);
  if (!workspaceId.success) {
    return { authorized: false, reason: 'workspace-mismatch' };
  }

  const workspaceHost = classifyWorkspaceSandboxRequestHost(req);
  if (workspaceHost.type !== 'workspace') {
    return { authorized: false, reason: 'invalid-host' };
  }
  if (!idsEqual(workspaceHost.workspaceId, workspaceId.data)) {
    return { authorized: false, reason: 'workspace-mismatch' };
  }

  return { authorized: true, workspaceHost };
}

function hasValidWorkspaceSandboxCookie(
  req: Pick<IncomingMessage, 'headers'>,
  workspaceId: string,
): boolean {
  const cookies = cookie.parse(req.headers.cookie ?? '');
  if (!Object.hasOwn(cookies, WORKSPACE_SANDBOX_COOKIE_NAME)) return false;

  return checkSignedToken(
    cookies[WORKSPACE_SANDBOX_COOKIE_NAME],
    getWorkspaceSandboxCookieData(workspaceId),
    config.secretKey,
    { maxAge: getWorkspaceSandboxCookieMaxAgeMilliseconds() },
  );
}

function getWorkspaceSandboxCookieData(workspaceId: string) {
  return {
    purpose: WORKSPACE_SANDBOX_AUTHORIZATION_COOKIE_PURPOSE,
    version: 1,
    workspace_id: IdSchema.parse(workspaceId),
  };
}

function getWorkspaceSandboxSessionData({
  workspaceId,
  sessionId,
  publicQuestionEndpoint,
  authorizationCookies,
}: {
  workspaceId: string;
  sessionId: string;
  publicQuestionEndpoint: boolean;
  authorizationCookies: Record<string, string>;
}): WorkspaceSandboxSession {
  return WorkspaceSandboxSessionSchema.parse({
    authorization_cookies: authorizationCookies,
    public_question_endpoint: publicQuestionEndpoint,
    purpose: WORKSPACE_SANDBOX_SESSION_COOKIE_PURPOSE,
    session_id: sessionId,
    version: 1,
    workspace_id: workspaceId,
  });
}

function getWorkspaceSandboxBaseDomain(): string {
  if (config.workspaceSandboxBaseDomain == null) {
    throw new Error('workspaceSandboxBaseDomain is not configured');
  }
  return config.workspaceSandboxBaseDomain.toLowerCase();
}

function classifyWorkspaceSandboxHost(hostname: string): WorkspaceSandboxHost {
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

export function validateWorkspaceSandboxAccess(
  req: Pick<IncomingMessage, 'headers' | 'method'>,
  expectedWorkspaceId: string,
): WorkspaceSandboxAccessResult {
  const hostAccess = validateWorkspaceSandboxHost(req, expectedWorkspaceId);
  if (!hostAccess.authorized) return hostAccess;

  const origin = req.headers.origin;
  const fetchSite = req.headers['sec-fetch-site'];
  if (
    origin !== getWorkspaceSandboxOrigin(hostAccess.workspaceHost) &&
    !(origin == null && fetchSite === 'same-origin')
  ) {
    return { authorized: false, reason: 'invalid-origin' };
  }

  if (!hasValidWorkspaceSandboxCookie(req, hostAccess.workspaceHost.workspaceId)) {
    return { authorized: false, reason: 'unauthorized' };
  }

  return hostAccess;
}

export function validateWorkspaceSandboxWebSocketAccess(
  req: Pick<IncomingMessage, 'headers'>,
  expectedWorkspaceId: string,
): WorkspaceSandboxAccessResult {
  const hostAccess = validateWorkspaceSandboxHost(req, expectedWorkspaceId);
  if (!hostAccess.authorized) return hostAccess;

  const origin = req.headers.origin;
  if (origin == null) {
    return { authorized: false, reason: 'invalid-origin' };
  }

  try {
    if (new URL(origin).origin !== getWorkspaceSandboxOrigin(hostAccess.workspaceHost)) {
      return { authorized: false, reason: 'invalid-origin' };
    }
  } catch {
    return { authorized: false, reason: 'invalid-origin' };
  }

  if (!hasValidWorkspaceSandboxCookie(req, hostAccess.workspaceHost.workspaceId)) {
    return { authorized: false, reason: 'unauthorized' };
  }

  return hostAccess;
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

export async function areWorkspaceSpecificHostsEnabled(locals: {
  institution?: { id: string };
  course?: { id: string; institution_id?: string };
  course_instance?: { id: string };
  authn_user?: { id: string };
}): Promise<boolean> {
  const institution =
    locals.institution ??
    (locals.course?.institution_id == null ? undefined : { id: locals.course.institution_id });

  // The config switch controls host routing at the deployment level; the feature flag controls
  // rollout only in environments where workspace-specific hosts have been configured.
  return (
    config.workspaceHostMode === 'cross-origin' &&
    (await features.enabledFromLocals('workspace-specific-hosts', { ...locals, institution }))
  );
}

export function getWorkspaceSandboxCookieMaxAgeMilliseconds(): number {
  return config.workspaceAuthzCookieMaxAgeMilliseconds;
}

export function getWorkspaceSandboxSessionCookieMaxAgeMilliseconds(): number {
  return config.sessionStoreExpireSeconds * 1000;
}

export function generateWorkspaceSandboxCookie({ workspaceId }: { workspaceId: string }): string {
  return generateSignedToken(getWorkspaceSandboxCookieData(workspaceId), config.secretKey);
}

export function getWorkspaceSandboxAuthorizationCookies(
  cookies: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    WORKSPACE_AUTHORIZATION_COOKIE_NAMES.flatMap((name) => {
      const value = cookies[name];
      return typeof value === 'string' ? [[name, value]] : [];
    }),
  );
}

export function generateWorkspaceSandboxSessionCookie({
  workspaceId,
  sessionId,
  publicQuestionEndpoint,
  authorizationCookies,
}: {
  workspaceId: string;
  sessionId: string;
  publicQuestionEndpoint: boolean;
  authorizationCookies: Record<string, string>;
}): string {
  return generateSignedToken(
    getWorkspaceSandboxSessionData({
      workspaceId,
      sessionId,
      publicQuestionEndpoint,
      authorizationCookies,
    }),
    config.secretKey,
  );
}

export function getWorkspaceSandboxSession(
  req: Pick<IncomingMessage, 'headers'>,
  expectedWorkspaceId: string,
): WorkspaceSandboxSession | null {
  const workspaceHost = classifyWorkspaceSandboxRequestHost(req);
  if (workspaceHost.type !== 'workspace') return null;

  const workspaceId = IdSchema.safeParse(expectedWorkspaceId);
  if (!workspaceId.success || !idsEqual(workspaceHost.workspaceId, workspaceId.data)) return null;

  const cookies = cookie.parse(req.headers.cookie ?? '');
  if (!Object.hasOwn(cookies, WORKSPACE_SANDBOX_SESSION_COOKIE_NAME)) return null;
  const token = cookies[WORKSPACE_SANDBOX_SESSION_COOKIE_NAME];

  const data = getCheckedSignedTokenData(token, config.secretKey, {
    maxAge: getWorkspaceSandboxSessionCookieMaxAgeMilliseconds(),
  });
  const result = WorkspaceSandboxSessionSchema.safeParse(data);
  if (!result.success || !idsEqual(result.data.workspace_id, workspaceHost.workspaceId)) {
    return null;
  }

  return result.data;
}

export async function generateWorkspaceSandboxBootstrapToken({
  workspaceId,
  sessionId,
  publicQuestionEndpoint,
  authorizationCookies,
}: {
  workspaceId: string;
  sessionId: string;
  publicQuestionEndpoint: boolean;
  authorizationCookies: Record<string, string>;
}): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await insertWorkspaceBootstrapToken({
    authorization_cookies: authorizationCookies,
    public_question_endpoint: publicQuestionEndpoint,
    session_id: sessionId,
    workspace_id: IdSchema.parse(workspaceId),
    token_hash: createHash('sha256').update(token).digest('hex'),
  });
  return token;
}

export async function redeemWorkspaceSandboxBootstrapToken(token: string, workspaceId: string) {
  return await consumeWorkspaceBootstrapToken({
    token_hash: createHash('sha256').update(token).digest('hex'),
    workspace_id: IdSchema.parse(workspaceId),
  });
}
