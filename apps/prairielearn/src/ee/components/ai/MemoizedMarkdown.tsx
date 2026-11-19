import { marked } from 'marked';
import { memo, useMemo } from 'react';
import ReactMarkdown, { type Options, type UrlTransform } from 'react-markdown';

// The approach taken here comes from this part of the AI SDK docs:
// https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization

/** How to render the Markdown. Pass the same object each time, or every block renders again. */
export type MarkdownOptions = Pick<Options, 'components' | 'remarkPlugins'>;

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

const MemoizedMarkdownBlock = memo(
  ({
    content,
    urlTransform,
    options,
  }: {
    content: string;
    urlTransform?: UrlTransform;
    options?: MarkdownOptions;
  }) => {
    return (
      <ReactMarkdown urlTransform={urlTransform} {...options}>
        {content}
      </ReactMarkdown>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.content !== nextProps.content) return false;
    if (prevProps.urlTransform !== nextProps.urlTransform) return false;
    if (prevProps.options !== nextProps.options) return false;
    return true;
  },
);

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

export const MemoizedMarkdown = memo(
  ({
    content,
    urlTransform,
    options,
  }: {
    content: string;
    urlTransform?: UrlTransform;
    options?: MarkdownOptions;
  }) => {
    const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

    return blocks.map((block, index) => (
      <MemoizedMarkdownBlock
        // oxlint-disable-next-line react/no-array-index-key
        key={`block_${index}`}
        content={block}
        urlTransform={urlTransform}
        options={options}
      />
    ));
  },
);

MemoizedMarkdown.displayName = 'MemoizedMarkdown';
