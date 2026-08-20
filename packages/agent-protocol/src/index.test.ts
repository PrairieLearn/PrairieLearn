import { assert, describe, it } from 'vitest';

import {
  AgentPublicationCapabilityClaimsSchema,
  AgentRunCapabilityClaimsSchema,
  AgentToolRequestSchema,
  StartAgentRunRequestSchema,
} from './index.js';

describe('StartAgentRunRequestSchema', () => {
  it('parses a deterministic local run', () => {
    assert.deepEqual(
      StartAgentRunRequestSchema.parse({
        conversation_id: 'conversation-1',
        run_id: 'run-1',
        course_id: '1',
        prompt: 'Create a question',
        prairielearn_base_url: 'http://host.docker.internal:3000',
        harness: 'deterministic',
      }),
      {
        conversation_id: 'conversation-1',
        run_id: 'run-1',
        course_id: '1',
        prompt: 'Create a question',
        prairielearn_base_url: 'http://host.docker.internal:3000',
        harness: 'deterministic',
      },
    );
  });

  it('rejects non-HTTPS repositories', () => {
    assert.throws(() =>
      StartAgentRunRequestSchema.parse({
        conversation_id: 'conversation-1',
        run_id: 'run-1',
        course_id: '1',
        prompt: 'Create a question',
        prairielearn_base_url: 'http://localhost:3000',
        harness: 'claude',
        repository: {
          https_url: 'http://github.com/PrairieLearn/test.git',
          branch: 'master',
          base_sha: 'a'.repeat(40),
        },
      }),
    );
  });
});

describe('AgentRunCapabilityClaimsSchema', () => {
  it('requires bounded identity and tool claims', () => {
    assert.equal(
      AgentRunCapabilityClaimsSchema.parse({
        iss: 'prairielearn',
        aud: ['prairielearn-agent-worker', 'prairielearn-agent-api'],
        sub: '7',
        iat: 1,
        exp: 2,
        jti: 'token-1',
        run_id: 'run-1',
        conversation_id: 'conversation-1',
        course_id: '1',
        authn_user_id: '7',
        user_id: '7',
        allowed_tools: ['list_entities', 'render_question'],
        purpose: 'run',
        prompt_sha256: 'a'.repeat(64),
        prairielearn_base_url: 'https://prairielearn.example',
        harness: 'deterministic',
      }).run_id,
      'run-1',
    );
  });

  it('rejects an invalid purpose, audience, or prompt hash', () => {
    const claims = {
      iss: 'prairielearn',
      aud: ['prairielearn-agent-worker', 'prairielearn-agent-api'],
      sub: '7',
      iat: 1,
      exp: 2,
      jti: 'token-1',
      run_id: 'run-1',
      conversation_id: 'conversation-1',
      course_id: '1',
      authn_user_id: '7',
      user_id: '7',
      allowed_tools: [],
      prairielearn_base_url: 'https://prairielearn.example',
      harness: 'deterministic',
      purpose: 'run',
      prompt_sha256: 'a'.repeat(64),
    };
    assert.throws(() => AgentRunCapabilityClaimsSchema.parse({ ...claims, purpose: 'admin' }));
    assert.throws(() => AgentRunCapabilityClaimsSchema.parse({ ...claims, aud: 'other-service' }));
    assert.throws(() =>
      AgentRunCapabilityClaimsSchema.parse({ ...claims, prompt_sha256: 'short' }),
    );
  });
});

describe('AgentPublicationCapabilityClaimsSchema', () => {
  it('binds publication to an operation and exact Git target', () => {
    assert.equal(
      AgentPublicationCapabilityClaimsSchema.parse({
        iss: 'prairielearn',
        aud: 'prairielearn-agent-worker',
        sub: '7',
        iat: 1,
        exp: 2,
        jti: 'publication-token-1',
        run_id: 'run-1',
        conversation_id: 'conversation-1',
        course_id: '1',
        authn_user_id: '7',
        user_id: '7',
        allowed_tools: [],
        prairielearn_base_url: 'https://prairielearn.example',
        harness: 'deterministic',
        purpose: 'publish',
        prompt_sha256: 'b'.repeat(64),
        operation_id: 'operation-1',
        target: {
          https_url: 'https://github.com/PrairieLearn/test.git',
          branch: 'pl-agent/course-1/run-1',
          head_sha: 'a'.repeat(40),
        },
      }).target.branch,
      'pl-agent/course-1/run-1',
    );
  });
});

describe('AgentToolRequestSchema', () => {
  it('rejects an empty operation id', () => {
    assert.throws(() => AgentToolRequestSchema.parse({ operation_id: '', input: {} }));
  });
});
