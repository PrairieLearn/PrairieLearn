import { type JWTPayload, jwtVerify } from 'jose';

import {
  type AgentPublicationCapabilityClaims,
  AgentPublicationCapabilityClaimsSchema,
  type AgentRunCapabilityClaims,
  AgentRunCapabilityClaimsSchema,
  type StartAgentRunRequest,
} from '@prairielearn/agent-protocol';

const capabilityIssuer = 'prairielearn';
const capabilityAudience = 'prairielearn-agent-worker';

export interface VerifiedCapability {
  claims: AgentRunCapabilityClaims;
  payload: JWTPayload;
  token: string;
}

export async function verifyCapability(
  request: Request,
  secret: string,
): Promise<VerifiedCapability> {
  const token = parseBearerToken(request.headers.get('authorization'));
  const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'],
    issuer: capabilityIssuer,
    audience: capabilityAudience,
  });

  if (protectedHeader.alg !== 'HS256') throw new Error('Unsupported capability algorithm');

  return {
    claims: AgentRunCapabilityClaimsSchema.parse(payload),
    payload,
    token,
  };
}

export async function assertStartCapability(
  capability: VerifiedCapability,
  body: StartAgentRunRequest,
): Promise<void> {
  assertPurpose(capability, 'run');
  assertEqual(capability.claims.run_id, body.run_id, 'run_id');
  assertEqual(capability.claims.conversation_id, body.conversation_id, 'conversation_id');
  assertEqual(capability.claims.course_id, body.course_id, 'course_id');
  assertEqual(
    capability.claims.prairielearn_base_url,
    body.prairielearn_base_url,
    'prairielearn_base_url',
  );
  assertEqual(capability.claims.harness, body.harness, 'harness');
  if (JSON.stringify(capability.claims.repository) !== JSON.stringify(body.repository)) {
    throw new Error('Capability repository does not match request');
  }
  assertEqual(
    stringClaim(capability.payload, 'prompt_sha256'),
    await sha256(body.prompt),
    'prompt',
  );
}

export function assertRunCapability(capability: VerifiedCapability, runId: string): void {
  assertPurpose(capability, 'control');
  assertEqual(capability.claims.run_id, runId, 'run_id');
}

export function assertConversationCapability(
  capability: VerifiedCapability,
  conversationId: string,
): void {
  assertPurpose(capability, 'delete');
  assertEqual(capability.claims.conversation_id, conversationId, 'conversation_id');
}

export function assertLocalControlCapability(
  capability: VerifiedCapability,
  conversationId: string,
): void {
  assertPurpose(capability, 'control');
  assertEqual(capability.claims.conversation_id, conversationId, 'conversation_id');
}

export function parsePublicationCapability(payload: JWTPayload): AgentPublicationCapabilityClaims {
  return AgentPublicationCapabilityClaimsSchema.parse(payload);
}

function parseBearerToken(header: string | null): string {
  if (!header?.startsWith('Bearer ')) throw new Error('Missing bearer capability');
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw new Error('Missing bearer capability');
  return token;
}

function assertEqual(actual: string, expected: string, name: string): void {
  if (actual !== expected) throw new Error(`Capability ${name} does not match request`);
}

function assertPurpose(capability: VerifiedCapability, purpose: string): void {
  assertEqual(stringClaim(capability.payload, 'purpose'), purpose, 'purpose');
}

function stringClaim(payload: JWTPayload, name: string): string {
  const value = payload[name];
  if (typeof value !== 'string') throw new Error(`Capability ${name} is missing`);
  return value;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
