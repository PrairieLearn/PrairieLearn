import { marked } from 'marked';
import { memo, useMemo } from 'react';
import ReactMarkdown, { type UrlTransform } from 'react-markdown';

// The approach taken here comes from this part of the AI SDK docs:
// https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

const MemoizedMarkdownBlock = memo(
  ({ content, urlTransform }: { content: string; urlTransform?: UrlTransform }) => {
    return <ReactMarkdown urlTransform={urlTransform}>{content}</ReactMarkdown>;
  },
  (prevProps, nextProps) => {
    if (prevProps.content !== nextProps.content) return false;
    if (prevProps.urlTransform !== nextProps.urlTransform) return false;
    return true;
  },
);

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

export const MemoizedMarkdown = memo(
  ({ content, urlTransform }: { content: string; urlTransform?: UrlTransform }) => {
    const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

    return blocks.map((block, index) => (
      // oxlint-disable-next-line react/no-array-index-key
      <MemoizedMarkdownBlock key={`block_${index}`} content={block} urlTransform={urlTransform} />
    ));
  },
);

MemoizedMarkdown.displayName = 'MemoizedMarkdown';
