import { createSecretKey } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

import {
  type AgentPublicationCapabilityClaims,
  AgentPublicationCapabilityClaimsSchema,
  type AgentRunCapabilityClaims,
  AgentRunCapabilityClaimsSchema,
} from '@prairielearn/agent-protocol';

import { config } from './config.js';

function getCapabilityKey() {
  if (config.agentCapabilitySecret === null) {
    throw new Error('Cloud agent capability signing is not configured');
  }
  return createSecretKey(Buffer.from(config.agentCapabilitySecret, 'utf8'));
}

export async function signAgentRunCapability(claims: AgentRunCapabilityClaims): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(getCapabilityKey());
}

export async function signAgentPublicationCapability(
  claims: AgentPublicationCapabilityClaims,
): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(getCapabilityKey());
}

export async function verifyAgentRunCapability(token: string): Promise<AgentRunCapabilityClaims> {
  const { payload } = await jwtVerify(token, getCapabilityKey(), {
    algorithms: ['HS256'],
    audience: 'prairielearn-agent-api',
    issuer: 'prairielearn',
  });
  return AgentRunCapabilityClaimsSchema.parse(payload);
}

export async function verifyAgentPublicationCapability(
  token: string,
): Promise<AgentPublicationCapabilityClaims> {
  const { payload } = await jwtVerify(token, getCapabilityKey(), {
    algorithms: ['HS256'],
    audience: 'prairielearn-agent-worker',
    issuer: 'prairielearn',
  });
  return AgentPublicationCapabilityClaimsSchema.parse(payload);
}
