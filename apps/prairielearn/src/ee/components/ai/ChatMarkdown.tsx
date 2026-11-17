import clsx from 'clsx';
import { marked } from 'marked';
import {
  createContext,
  createElement,
  memo,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown, { type Components, type UrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remend from 'remend';

import { loadMathjax, mathjaxTypeset } from '../../../lib/client/mathjax.js';

const CodeFenceIncompleteContext = createContext(false);

function MermaidDiagram({ code }: { code: string }) {
  const id = useId();
  const isIncomplete = use(CodeFenceIncompleteContext);
  const [result, setResult] = useState<{ code: string; svg?: string; error?: string } | null>(null);

  // Renders the diagram once its code fence has finished streaming. Mermaid is
  // large and most messages have no diagram, so it is only downloaded the
  // first time one is rendered.
  useEffect(() => {
    if (isIncomplete) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
        });
        const { svg } = await mermaid.render(`mermaid-${id.replaceAll(/\W/g, '')}`, code);
        if (!controller.signal.aborted) {
          setResult({
            code,
            // Mermaid shrinks a diagram to fit its container. Stop at 75% of its
            // natural width so a wide diagram scrolls instead of becoming unreadable.
            svg: svg.replace(
              /max-width:\s*([\d.]+)px/,
              (match, width) => `min-width: ${Math.round(Number(width) * 0.75)}px; ${match}`,
            ),
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setResult({ code, error: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => controller.abort();
  }, [code, id, isIncomplete]);

  if (result?.code === code && result.svg) {
    return (
      <div
        className="mb-3 overflow-auto text-center"
        role="img"
        aria-label="Diagram"
        // oxlint-disable-next-line react/no-danger -- Mermaid sanitizes its SVG output.
        dangerouslySetInnerHTML={{ __html: result.svg }}
      />
    );
  }

  return (
    <>
      {result?.code === code && result.error && (
        <div className="alert alert-warning small mb-2" role="alert">
          This diagram could not be rendered: {result.error}
        </div>
      )}
      <pre>
        <code>{code}</code>
      </pre>
    </>
  );
}

function MathExpression({ tex, display }: { tex: string; display: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const source = display ? `$$${tex}$$` : `$${tex}$`;

  // MathJax replaces the source text with the typeset math. An expression
  // that is still streaming changes several times a second, so this waits
  // until it has settled instead of typesetting each partial expression.
  useEffect(() => {
    const timeout = setTimeout(async () => {
      await loadMathjax();
      if (ref.current) await mathjaxTypeset([ref.current]);
    }, 200);
    return () => clearTimeout(timeout);
  }, [source]);

  // The key gives a changed expression a fresh element, since MathJax has
  // replaced the contents of the old one.
  return createElement(
    display ? 'div' : 'span',
    { key: source, ref, className: clsx('mathjax_process', display && 'mb-3 overflow-auto') },
    source,
  );
}

const components: Components = {
  code: ({ node: _node, className, children, ...props }) => {
    if (className?.includes('math-inline') && typeof children === 'string') {
      return <MathExpression tex={children} display={false} />;
    }
    return (
      <code {...props} className={className}>
        {children}
      </code>
    );
  },
  pre: ({ node, children }) => {
    const code = node?.children[0];
    if (code?.type === 'element' && Array.isArray(code.properties.className)) {
      const text = code.children
        .map((child) => (child.type === 'text' ? child.value : ''))
        .join('');
      if (code.properties.className.includes('language-mermaid')) {
        return <MermaidDiagram code={text} />;
      }
      if (code.properties.className.includes('math-display')) {
        return <MathExpression tex={text.trim()} display />;
      }
    }
    return <pre>{children}</pre>;
  },
  img: ({ node: _node, alt, ...props }) => <img {...props} alt={alt ?? ''} className="img-fluid" />,
  table: ({ node: _node, ...props }) => (
    <div className="table-responsive mb-3">
      <table {...props} className="table table-sm table-bordered mb-0" />
    </div>
  ),
};

// Models usually delimit math with `\(...\)` and `\[...\]`, which markdown
// reads as escaped brackets. Code is matched first so that it is left alone.
const MATH_DELIMITERS = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)|\\\[([\s\S]*?)\\\]|\\\((.*?)\\\)/g;

function normalizeMathDelimiters(markdown: string) {
  return markdown.replaceAll(MATH_DELIMITERS, (match, code, display, inline) => {
    if (code !== undefined) return match;
    return display !== undefined ? `$$${display}$$` : `$${inline}$`;
  });
}

function hasOpenCodeFence(markdown: string) {
  return (markdown.match(/^\s*(?:```|~~~)/gm)?.length ?? 0) % 2 === 1;
}

const remarkPlugins = [remarkGfm, remarkMath];

const MarkdownBlock = memo(function MarkdownBlock({
  content,
  urlTransform,
  codeFenceIncomplete,
}: {
  content: string;
  urlTransform?: UrlTransform;
  codeFenceIncomplete: boolean;
}) {
  return (
    <CodeFenceIncompleteContext value={codeFenceIncomplete}>
      <ReactMarkdown
        components={components}
        remarkPlugins={remarkPlugins}
        urlTransform={urlTransform}
      >
        {content}
      </ReactMarkdown>
    </CodeFenceIncompleteContext>
  );
});

export function ChatMarkdown({
  content,
  className,
  urlTransform,
  isStreaming = false,
}: {
  content: string;
  className?: string;
  urlTransform?: UrlTransform;
  isStreaming?: boolean;
}) {
  // Each block is rendered separately so that only the block that is still
  // streaming is parsed again as text arrives. A link that is still streaming
  // has no destination yet, so it is shown as text until it is complete.
  const blocks = useMemo(
    () =>
      marked
        .lexer(remend(normalizeMathDelimiters(content), { linkMode: 'text-only' }))
        .map((token) => token.raw),
    [content],
  );

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <MarkdownBlock
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          content={block}
          urlTransform={urlTransform}
          codeFenceIncomplete={
            isStreaming && index === blocks.length - 1 && hasOpenCodeFence(block)
          }
        />
      ))}
    </div>
  );
}
