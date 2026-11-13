import { type JSX, createElement, useEffect, useId, useState } from 'react';
import type { UrlTransform } from 'react-markdown';
import { type Components, Streamdown, useIsCodeFenceIncomplete } from 'streamdown';

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
  inlineCode: plain('code'),
  // `pre` is left to Streamdown: it only marks its child as a block, and
  // `code` then renders the whole code block.
  code: ({ className, children }) => {
    if (className?.includes('language-mermaid') && typeof children === 'string') {
      return <MermaidDiagram code={children} />;
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

export function ChatMarkdown({
  content,
  urlTransform,
  isStreaming = false,
}: {
  content: string;
  urlTransform?: UrlTransform;
  isStreaming?: boolean;
}) {
  return (
    <Streamdown
      components={components}
      controls={false}
      isAnimating={isStreaming}
      linkSafety={{ enabled: false }}
      urlTransform={urlTransform}
    >
      {content}
    </Streamdown>
  );
}
