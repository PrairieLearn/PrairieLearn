import { assert, describe, it } from 'vitest';

import {
  getAgentConversationUiState,
  getQuestionPreview,
  shouldPollAgentEventPage,
} from './AgentConversationsPage.js';

describe('getAgentConversationUiState', () => {
  it('marks pending and running turns as active', () => {
    assert.isTrue(getAgentConversationUiState({ status: 'pending' }, []).runActive);
    assert.isTrue(getAgentConversationUiState({ status: 'running' }, []).runActive);
    assert.isTrue(getAgentConversationUiState({ status: 'stopping' }, []).runActive);
  });

  it('offers retry after a failed or canceled turn', () => {
    assert.isTrue(getAgentConversationUiState({ status: 'failed' }, []).runRetryable);
    assert.isTrue(getAgentConversationUiState({ status: 'canceled' }, []).runRetryable);
    assert.isFalse(getAgentConversationUiState({ status: 'completed' }, []).runRetryable);
  });

  it('offers publication only for a completed checkpoint', () => {
    assert.isFalse(
      getAgentConversationUiState({ status: 'running', checkpoint_key: 'checkpoint' }, [])
        .canPublish,
    );
    assert.isFalse(getAgentConversationUiState({ status: 'completed' }, []).canPublish);
    assert.isTrue(
      getAgentConversationUiState({ status: 'completed' }, [{ sequence: 10, type: 'checkpoint' }])
        .canPublish,
    );
    assert.isTrue(
      getAgentConversationUiState({ status: 'completed', head_sha: '0123456789abcdef' }, [])
        .canPublish,
    );
  });
});

describe('shouldPollAgentEventPage', () => {
  it('polls active turns and waits for their terminal event', () => {
    assert.isTrue(shouldPollAgentEventPage({ events: [] }, { status: 'running' }));
    assert.isTrue(
      shouldPollAgentEventPage(
        { events: [{ type: 'assistant_message' }] },
        { status: 'completed' },
      ),
    );
    assert.isFalse(
      shouldPollAgentEventPage({ events: [{ type: 'run_completed' }] }, { status: 'completed' }),
    );
  });

  it('lets the next cursor page own polling when more events are available', () => {
    assert.isFalse(
      shouldPollAgentEventPage(
        { events: [{ type: 'tool_call' }], hasMore: true },
        { status: 'running' },
      ),
    );
  });
});

describe('getQuestionPreview', () => {
  it('extracts a rendered question and its deterministic seed', () => {
    const preview = getQuestionPreview({
      type: 'tool_result',
      data: {
        tool_name: 'render_question',
        result: {
          rendered: true,
          variant_seed: 'v1',
          preview: { extra_headers_html: '<style>body{color:red}</style>', html: '<p>Hello</p>' },
        },
      },
    });
    assert.include(preview?.html, '<style>body{color:red}</style>');
    assert.include(preview?.html, '<p>Hello</p>');
    assert.equal(preview?.variantSeed, 'v1');
  });

  it('ignores non-render and failed render tool results', () => {
    assert.isNull(getQuestionPreview({ type: 'assistant_message', data: {} }));
    assert.isNull(
      getQuestionPreview({
        type: 'tool_result',
        data: { tool_name: 'render_question', result: { rendered: false } },
      }),
    );
  });
});
