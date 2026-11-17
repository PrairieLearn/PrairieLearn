import clsx from 'clsx';
import { type JSX, createElement, useEffect, useId, useRef, useState } from 'react';
import type { UrlTransform } from 'react-markdown';
import remarkMath from 'remark-math';
import {
  type Components,
  Streamdown,
  defaultRehypePlugins,
  defaultRemarkPlugins,
  useIsCodeFenceIncomplete,
} from 'streamdown';

import { loadMathjax, mathjaxTypeset } from '../../../lib/client/mathjax.js';

// Streamdown's default renderers are styled with Tailwind, which we don't
// use. Some of its utility class names (`px-4`, `py-2`, `mb-2`) also exist in
// Bootstrap with different values, and it renders bold text as a styled
// `<span>`, so every element is rendered as its plain tag instead and picks
// up our existing Bootstrap and `.markdown-body` styles.
function plain(tag: keyof JSX.IntrinsicElements) {
  return ({
    node: _node,
    className: _className,
    ...props
  }: {
    node?: unknown;
    className?: string;
  }) => createElement(tag, props);
}

function MermaidDiagram({ code }: { code: string }) {
  const id = useId();
  const isIncomplete = useIsCodeFenceIncomplete();
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

const PLAIN_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
] as const;

const components: Components = {
  ...Object.fromEntries(PLAIN_TAGS.map((tag) => [tag, plain(tag)])),
  strong: plain('strong'),
  inlineCode: ({ node: _node, className, children, ...props }) => {
    if (className?.includes('language-math') && typeof children === 'string') {
      return <MathExpression tex={children} display={false} />;
    }
    return <code {...props}>{children}</code>;
  },
  // `pre` is left to Streamdown: it only marks its child as a block, and
  // `code` then renders the whole code block.
  code: ({ className, children }) => {
    if (className?.includes('language-mermaid') && typeof children === 'string') {
      return <MermaidDiagram code={children} />;
    }
    if (className?.includes('language-math') && typeof children === 'string') {
      return <MathExpression tex={children.trim()} display />;
    }
    return (
      <pre>
        <code className={className}>{children}</code>
      </pre>
    );
  },
  a: ({ node: _node, className: _className, target: _target, rel: _rel, ...props }) =>
    createElement('a', props),
  img: ({ node: _node, className: _className, alt, ...props }) => (
    <img {...props} alt={alt ?? ''} className="img-fluid" />
  ),
  table: ({ node: _node, className: _className, ...props }) => (
    <div className="table-responsive mb-3">
      <table {...props} className="table table-sm table-bordered mb-0" />
    </div>
  ),
};

interface HastNode {
  type: string;
  children?: HastNode[];
}

// Streamdown parses HTML in a message and then sanitizes it, which silently
// drops any tag it doesn't know. Replies routinely mention elements like
// `<pl-number-input>` outside of code spans, so HTML is shown as written
// instead.
function rehypeHtmlAsText() {
  const visit = (node: HastNode) => {
    if (node.type === 'raw') node.type = 'text';
    node.children?.forEach(visit);
  };
  return visit;
}

// Models usually delimit math with `\(...\)` and `\[...\]`, which markdown
// reads as escaped brackets. Code is matched first so that it is left alone.
const MATH_DELIMITERS = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)|\\\[([\s\S]*?)\\\]|\\\((.*?)\\\)/g;

function normalizeMathDelimiters(markdown: string) {
  return markdown.replaceAll(MATH_DELIMITERS, (match, code, display, inline) => {
    if (code !== undefined) return match;
    return display !== undefined ? `$$${display}$$` : `$${inline}$`;
  });
}

const remarkPlugins = [...Object.values(defaultRemarkPlugins), remarkMath];

const rehypePlugins = [
  rehypeHtmlAsText,
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
];

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
  return (
    <Streamdown
      className={className}
      components={components}
      controls={false}
      isAnimating={isStreaming}
      linkSafety={{ enabled: false }}
      rehypePlugins={rehypePlugins}
      remarkPlugins={remarkPlugins}
      // A link that is still streaming has no destination yet, so it is shown
      // as text until it is complete.
      remend={{ linkMode: 'text-only' }}
      urlTransform={urlTransform}
    >
      {normalizeMathDelimiters(content)}
    </Streamdown>
  );
}
