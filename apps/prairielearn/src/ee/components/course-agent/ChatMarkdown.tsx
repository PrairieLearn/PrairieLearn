import { marked } from 'marked';
import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';

// The approach taken here comes from this part of the AI SDK docs:
// https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

interface ChatMarkdownProps {
  content: string;
  components?: Components;
  remarkPlugins?: Options['remarkPlugins'];
}

const ChatMarkdownBlock = memo(({ content, ...options }: ChatMarkdownProps) => (
  <ReactMarkdown {...options} skipHtml>
    {content}
  </ReactMarkdown>
));

ChatMarkdownBlock.displayName = 'ChatMarkdownBlock';

export const ChatMarkdown = memo(({ content, ...options }: ChatMarkdownProps) => {
  const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

  return blocks.map((block, index) => (
    // eslint-disable-next-line @eslint-react/no-array-index-key
    <ChatMarkdownBlock key={`block_${index}`} content={block} {...options} />
  ));
});

ChatMarkdown.displayName = 'ChatMarkdown';
