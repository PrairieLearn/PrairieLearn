import { describe, expect, it } from 'vitest';

import type {
  AgentPublicationCapabilityClaims,
  AgentRunCapabilityClaims,
} from '@prairielearn/agent-protocol';

import { withConfig } from '../tests/utils/config.js';

import {
  signAgentPublicationCapability,
  signAgentRunCapability,
  verifyAgentPublicationCapability,
  verifyAgentRunCapability,
} from './agent-capability.js';

const SECRET = 'test-agent-capability-secret-at-least-32-bytes';

function runClaims(): AgentRunCapabilityClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    allowed_tools: ['list_entities', 'render_question'],
    aud: ['prairielearn-agent-worker', 'prairielearn-agent-api'],
    authn_user_id: '10',
    conversation_id: '20',
    course_id: '30',
    exp: now + 60,
    harness: 'deterministic',
    iat: now,
    iss: 'prairielearn',
    jti: 'capability-id',
    prairielearn_base_url: 'https://prairielearn.example',
    prompt_sha256: 'c'.repeat(64),
    purpose: 'run',
    repository: {
      base_sha: 'a'.repeat(40),
      branch: 'main',
      https_url: 'https://github.com/prairielearn/course.git',
    },
    run_id: '40',
    sub: '10',
    user_id: '10',
  };
}

describe('agent capabilities', () => {
  it('round-trips an audience-bound run capability', async () => {
    await withConfig({ agentCapabilitySecret: SECRET }, async () => {
      const claims = runClaims();
      const token = await signAgentRunCapability(claims);
      await expect(verifyAgentRunCapability(token)).resolves.toEqual(claims);
    });
  });

  it('rejects a modified capability', async () => {
    await withConfig({ agentCapabilitySecret: SECRET }, async () => {
      const token = await signAgentRunCapability(runClaims());
      const [header, payload, signature] = token.split('.');
      const modified = `${header}.${payload}.${signature.startsWith('a') ? 'b' : 'a'}${signature.slice(1)}`;
      await expect(verifyAgentRunCapability(modified)).rejects.toThrow();
    });
  });

  it('round-trips a publication capability bound to its target', async () => {
    await withConfig({ agentCapabilitySecret: SECRET }, async () => {
      const claims: AgentPublicationCapabilityClaims = {
        ...runClaims(),
        aud: 'prairielearn-agent-worker',
        operation_id: 'publish:40:head',
        purpose: 'publish',
        target: {
          branch: 'pl-agent/20-head',
          head_sha: 'b'.repeat(40),
          https_url: 'https://github.com/prairielearn/course.git',
        },
      };
      const token = await signAgentPublicationCapability(claims);
      await expect(verifyAgentPublicationCapability(token)).resolves.toEqual(claims);
    });
  });
});
