import type { UIMessage } from 'ai';
import type { ComponentProps, ReactNode } from 'react';

import { ChatMarkdown } from './ChatMarkdown.js';
import { ReasoningBlock } from './ChatReasoning.js';

export function ChatMessageParts<T extends UIMessage>({
  parts,
  renderTool,
  markdownOptions,
}: {
  parts: T['parts'];
  renderTool: (part: T['parts'][number]) => ReactNode;
  markdownOptions?: Omit<ComponentProps<typeof ChatMarkdown>, 'content'>;
}) {
  return parts.map((part, index) => {
    const key = `part-${index}`;
    if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
      return <div key={key}>{renderTool(part)}</div>;
    }
    if (part.type === 'text') {
      return (
        <div key={key} className="markdown-body">
          <ChatMarkdown content={part.text} {...markdownOptions} />
        </div>
      );
    }
    if (part.type === 'reasoning') return <ReasoningBlock key={key} part={part} />;
    if (part.type === 'step-start') return null;
    return (
      <pre key={key}>
        <code>{JSON.stringify(part, null, 2)}</code>
      </pre>
    );
  });
}
