import { marked } from 'marked';
import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

// The approach taken here comes from this part of the AI SDK docs:
// https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization

const MATH_PATTERN = /\$\$[\s\S]+?\$\$|\$[^\s$](?:[^$]*[^\s$])?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/;

function containsMath(text: string): boolean {
  return MATH_PATTERN.test(text);
}

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

/**
 * For blocks containing LaTeX math, render as raw HTML so MathJax can
 * typeset the `$...$` and `$$...$$` delimiters without markdown parser
 * interference. For blocks without math, use ReactMarkdown for proper
 * markdown rendering.
 */
const MemoizedMarkdownBlock = memo(
  ({ content }: { content: string }) => {
    if (containsMath(content)) {
      return <span dangerouslySetInnerHTML={{ __html: content }} />;
    }
    return <ReactMarkdown>{content}</ReactMarkdown>;
  },
  (prevProps, nextProps) => {
    if (prevProps.content !== nextProps.content) return false;
    return true;
  },
);

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

export const MemoizedMarkdown = memo(({ content }: { content: string }) => {
  const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

  return blocks.map((block, index) => (
    // eslint-disable-next-line @eslint-react/no-array-index-key
    <MemoizedMarkdownBlock key={`block_${index}`} content={block} />
  ));
});

MemoizedMarkdown.displayName = 'MemoizedMarkdown';
