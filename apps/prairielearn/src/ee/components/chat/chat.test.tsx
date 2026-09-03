// @vitest-environment jsdom
import { act, useState } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from './ChatComposer.js';
import { ChatMarkdown } from './ChatMarkdown.js';
import { AssistantMessage, UserMessage } from './ChatMessage.js';
import { ToolCallStatus } from './ChatProgressStatus.js';
import { ReasoningBlock } from './ChatReasoning.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('shared agent chat', () => {
  it('sends with Enter but not Shift+Enter or an IME composition', async () => {
    const submit = vi.fn();

    function Composer() {
      const [value, setValue] = useState('Hello');
      return (
        <ChatComposer
          value={value}
          disabled={false}
          isGenerating={false}
          footer={<span>Codex</span>}
          onChange={setValue}
          onSubmit={submit}
        />
      );
    }
    await act(async () => root.render(<Composer />));
    const input = container.querySelector('textarea')!;
    for (const options of [{ shiftKey: true }, { isComposing: true }]) {
      await act(async () =>
        input.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
            ...options,
          }),
        ),
      );
    }
    expect(submit).not.toHaveBeenCalled();
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      ),
    );
    expect(submit).toHaveBeenCalledWith('Hello');
    expect(container.textContent).toContain('Codex');
  });

  it('provides stop only when the feature supports cancellation', async () => {
    const stop = vi.fn();
    const props = {
      value: 'Hello',
      onChange: vi.fn(),
      onSubmit: vi.fn(),
      disabled: false,
      isGenerating: true,
    };
    await act(async () => root.render(<ChatComposer {...props} onStop={stop} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(stop).toHaveBeenCalledOnce();
    await act(async () => root.render(<ChatComposer {...props} />));
    expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    await act(async () => container.querySelector('form')!.requestSubmit());
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('preserves reasoning expansion while streaming and user control afterwards', async () => {
    await act(async () =>
      root.render(
        <ReasoningBlock part={{ type: 'reasoning', state: 'streaming', text: 'Summary' }} />,
      ),
    );
    expect(container.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
    await act(async () =>
      root.render(<ReasoningBlock part={{ type: 'reasoning', state: 'done', text: 'Summary' }} />),
    );
    expect(container.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(container.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
    await act(async () =>
      root.render(
        <ReasoningBlock part={{ type: 'reasoning', state: 'done', text: 'Updated summary' }} />,
      ),
    );
    expect(container.textContent).toContain('Updated summary');
  });

  it('does not render empty reasoning', async () => {
    await act(async () =>
      root.render(<ReasoningBlock part={{ type: 'reasoning', state: 'done', text: '' }} />),
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders user metadata and accessible assistant messages', async () => {
    await act(async () =>
      root.render(
        <>
          <UserMessage userName="Instructor" createdAt="2026-09-03T12:00:00Z">
            Hello
          </UserMessage>
          <AssistantMessage>Hi</AssistantMessage>
        </>,
      ),
    );
    expect(container.querySelectorAll('[role="article"]')).toHaveLength(2);
    expect(container.textContent).toContain('Instructor');
    expect(container.querySelector('time')!.dateTime).toBe('2026-09-03T12:00:00Z');
  });

  it.each(['input-available', 'output-available', 'output-error'] as const)(
    'renders tool state %s',
    async (state) => {
      await act(async () =>
        root.render(<ToolCallStatus state={state} statusText="Read question.html" />),
      );
      expect(container.textContent).toContain('Read question.html');
      expect(container.querySelectorAll('.spinner-border')).toHaveLength(
        state === 'input-available' ? 1 : 0,
      );
    },
  );

  it('updates Markdown without rendering raw HTML', async () => {
    await act(async () => root.render(<ChatMarkdown content="First `code`" />));
    expect(container.querySelector('code')!.textContent).toBe('code');
    await act(async () =>
      root.render(
        <ChatMarkdown content={'First `code`\n\n**Done**\n\n<script>alert(1)</script>'} />,
      ),
    );
    expect(container.querySelector('strong')!.textContent).toBe('Done');
    expect(container.querySelector('script')).toBeNull();
  });
});
