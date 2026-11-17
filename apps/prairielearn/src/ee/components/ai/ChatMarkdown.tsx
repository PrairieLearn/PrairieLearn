import clsx from 'clsx';
import { createElement, useEffect, useRef } from 'react';
import type { UrlTransform } from 'react-markdown';
import remarkMath from 'remark-math';
import {
  type Components,
  Streamdown,
  defaultRehypePlugins,
  defaultRemarkPlugins,
} from 'streamdown';

import { loadMathjax, mathjaxTypeset } from '../../../lib/client/mathjax.js';

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

// Streamdown styles these tags with Tailwind utility classes, which are
// missing or mean something else in our Bootstrap app, so each is replaced
// with the plain tag.
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
  'strong',
] as const;

const components: Components = {
  ...Object.fromEntries(PLAIN_TAGS.map((tag) => [tag, tag])),
  inlineCode: ({ node: _node, className, children, ...props }) => {
    if (className?.includes('language-math') && typeof children === 'string') {
      return <MathExpression tex={children} display={false} />;
    }
    return <code {...props}>{children}</code>;
  },
  // `pre` is left to Streamdown: it only marks its child as a block, and
  // `code` then renders the whole code block.
  code: ({ className, children }) => {
    if (className?.includes('language-math') && typeof children === 'string') {
      return <MathExpression tex={children.trim()} display />;
    }
    return (
      <pre>
        <code className={className}>{children}</code>
      </pre>
    );
  },
  // Streamdown marks every link to open in a new tab. Course file links should
  // open in the same tab.
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

// Streamdown's default `raw` plugin is left out on purpose. It parses HTML in
// a message into elements, and sanitizing then silently drops any tag it
// doesn't know. Replies routinely mention elements like `<pl-number-input>`
// outside of code spans; without `raw`, HTML is shown as written instead.
const rehypePlugins = [defaultRehypePlugins.sanitize, defaultRehypePlugins.harden];

export function ChatMarkdown({
  content,
  className,
  urlTransform,
}: {
  content: string;
  className?: string;
  urlTransform?: UrlTransform;
}) {
  return (
    <Streamdown
      className={className}
      components={components}
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
