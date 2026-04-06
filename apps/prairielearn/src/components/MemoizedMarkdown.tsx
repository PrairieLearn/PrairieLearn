import { marked } from 'marked';
import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

// The approach taken here comes from this part of the AI SDK docs:
// https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization

/**
 * Protect LaTeX math from markdown parsing by replacing math expressions
 * with unique placeholders. After ReactMarkdown renders, the placeholders
 * remain in the DOM text and MathJax typesets them on the client.
 *
 * We use Unicode private-use-area characters as delimiters for placeholders
 * so they won't collide with any markdown syntax.
 */
function protectMath(text: string): string {
  const placeholders: string[] = [];

  const replaced = text
    // Display math: $$...$$
    .replaceAll(/\$\$([\s\S]+?)\$\$/g, (_match, content) => {
      const idx = placeholders.length;
      placeholders.push(content);
      return `\uE000DISPLAY${idx}\uE001`;
    })
    // Inline math: $...$  (not empty, not starting/ending with space)
    .replaceAll(/\$([^\s$](?:[^$]*[^\s$])?)\$/g, (_match, content) => {
      const idx = placeholders.length;
      placeholders.push(content);
      return `\uE000INLINE${idx}\uE001`;
    })
    // \(...\) inline
    .replaceAll(/\\\((.+?)\\\)/g, (_match, content) => {
      const idx = placeholders.length;
      placeholders.push(content);
      return `\uE000INLINE${idx}\uE001`;
    })
    // \[...\] display
    .replaceAll(/\\\[([\s\S]+?)\\\]/g, (_match, content) => {
      const idx = placeholders.length;
      placeholders.push(content);
      return `\uE000DISPLAY${idx}\uE001`;
    });

  // Restore placeholders back to LaTeX delimiters
  return replaced.replaceAll(/\uE000(DISPLAY|INLINE)(\d+)\uE001/g, (_match, type, idxStr) => {
    const idx = Number.parseInt(idxStr, 10);
    const content = placeholders[idx];
    return type === 'DISPLAY' ? `$$${content}$$` : `$${content}$`;
  });
}

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

const MemoizedMarkdownBlock = memo(
  ({ content }: { content: string }) => {
    const safeContent = useMemo(() => protectMath(content), [content]);
    return <ReactMarkdown>{safeContent}</ReactMarkdown>;
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
