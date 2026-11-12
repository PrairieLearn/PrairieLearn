import { type JSX, createElement } from 'react';
import type { UrlTransform } from 'react-markdown';
import { type Components, Streamdown } from 'streamdown';

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
  'pre',
] as const;

const components: Components = {
  ...Object.fromEntries(PLAIN_TAGS.map((tag) => [tag, plain(tag)])),
  strong: plain('strong'),
  inlineCode: plain('code'),
  code: ({ node: _node, ...props }) => <code {...props} />,
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

export function MemoizedMarkdown({
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
